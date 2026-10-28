import type { Rol } from '@cursus/shared'
import { DataSource, type QueryRunner } from 'typeorm'
import { ROL_APP } from '../../src/database/base-de-datos.service.js'
import { opcionesDataSource } from '../../src/database/data-source.js'
import { ejecutarSeed, UNIVERSIDADES } from '../../src/database/seed.js'

// Consultas directas a la base, sin pasar por la API: prueban que RLS aísla
// las universidades aunque una consulta no filtre por universidad, y que el
// Director lee todas pero no modifica ninguna (ADR 0001).

// Base propia con el seed cargado, que se crea y se borra en cada ejecución.
const BD_TEST = `${process.env.POSTGRES_TEST_DB ?? 'cursus_test'}_rls`

// Códigos de error de PostgreSQL.
const SIN_PERMISO = '42501'

// Tablas institucionales y la columna que identifica su universidad.
const TABLAS = [
  ['universidad', 'id'],
  ['facultad', 'universidad_id'],
  ['carrera', 'universidad_id'],
  ['periodo', 'universidad_id'],
  ['usuario', 'universidad_id'],
  ['curso', 'universidad_id'],
  ['seccion', 'universidad_id'],
  ['inscripcion', 'universidad_id'],
  ['ayudante_seccion', 'universidad_id'],
  ['horario_seccion', 'universidad_id'],
] as const

let admin: DataSource
let bd: DataSource
const universidades: Record<string, string> = {}
const [NORTE, SUR] = UNIVERSIDADES.map((u) => u.dominio)

// Ejecuta la prueba con el rol de la API, dentro de una transacción que se
// revierte al terminar. Solo fija lo que se le pasa, igual que la API.
async function comoApp(
  sesion: { universidadId?: string; rol?: Rol },
  prueba: (q: QueryRunner) => Promise<void>,
) {
  const q = bd.createQueryRunner()
  await q.startTransaction()
  try {
    await q.query(`SET LOCAL ROLE ${ROL_APP}`)
    if (sesion.universidadId) {
      await q.query(`SELECT set_config('app.universidad_id', $1, true)`, [
        sesion.universidadId,
      ])
    }
    if (sesion.rol) {
      await q.query(`SELECT set_config('app.rol', $1, true)`, [sesion.rol])
    }
    await prueba(q)
  } finally {
    await q.rollbackTransaction()
    await q.release()
  }
}

// Lo que hay en la base, leído por el dueño de las tablas (sin RLS).
const idsDe = (tabla: string, filtro = '', parametros: unknown[] = []) =>
  bd.query<{ id: string }[]>(
    `SELECT id FROM ${tabla} ${filtro} ORDER BY id`,
    parametros,
  )

beforeAll(async () => {
  admin = await new DataSource(opcionesDataSource()).initialize()
  await admin.query(`DROP DATABASE IF EXISTS "${BD_TEST}" WITH (FORCE)`)
  await admin.query(`CREATE DATABASE "${BD_TEST}"`)
  bd = await new DataSource(opcionesDataSource(BD_TEST)).initialize()
  await bd.runMigrations()
  await ejecutarSeed(bd, 'contraseña-de-prueba')

  for (const { dominio } of UNIVERSIDADES) {
    const [{ id }] = await bd.query<{ id: string }[]>(
      'SELECT id FROM universidad WHERE dominio_correo = $1',
      [dominio],
    )
    universidades[dominio] = id

    // Un curso propio por universidad, como dueño de las tablas.
    await bd.query(
      `INSERT INTO curso (universidad_id, carrera_id, periodo_id, codigo, nombre)
       SELECT $1, c.id, p.id, 'RLS101', 'Curso de prueba'
         FROM carrera c, periodo p
        WHERE c.universidad_id = $1 AND p.universidad_id = $1
        LIMIT 1`,
      [id],
    )
    // Una sección del curso anterior, para los tests genéricos de seccion.
    await bd.query(
      `INSERT INTO seccion (universidad_id, curso_id, numero)
       SELECT $1, id, 1 FROM curso WHERE universidad_id = $1 AND codigo = 'RLS101'`,
      [id],
    )
    // Un alumno del seed inscrito en esa sección.
    await bd.query(
      `INSERT INTO inscripcion (universidad_id, seccion_id, usuario_id)
       SELECT $1, s.id, u.id
         FROM seccion s
         JOIN curso c ON c.id = s.curso_id AND c.codigo = 'RLS101'
         JOIN LATERAL (SELECT id FROM usuario
                        WHERE universidad_id = $1 AND rol = 'ALUMNO' LIMIT 1) u ON true
        WHERE s.universidad_id = $1`,
      [id],
    )
    await bd.query(
      `INSERT INTO ayudante_seccion (universidad_id, seccion_id, usuario_id)
      SELECT $1, s.id, u.id FROM seccion s
        JOIN curso c ON c.id = s.curso_id AND c.codigo = 'RLS101'
        JOIN LATERAL (SELECT id FROM usuario WHERE universidad_id = $1 AND rol = 'AYUDANTE' LIMIT 1) u ON true
       WHERE s.universidad_id = $1`,
      [id],
    )
    await bd.query(
      `INSERT INTO horario_seccion (universidad_id, seccion_id, dia, inicio, termino, sala)
      SELECT $1, s.id, 1, '08:30', '09:20', 'Sala RLS' FROM seccion s
        JOIN curso c ON c.id = s.curso_id AND c.codigo = 'RLS101'
       WHERE s.universidad_id = $1`,
      [id],
    )
  }
})

afterAll(async () => {
  await bd?.destroy()
  if (admin?.isInitialized) {
    await admin.query(`DROP DATABASE IF EXISTS "${BD_TEST}" WITH (FORCE)`)
    await admin.destroy()
  }
})

describe('RLS por universidad', () => {
  it.each(TABLAS)(
    '%s: sin universidad fijada no devuelve filas',
    async (tabla) => {
      await comoApp({ rol: 'ADMINISTRATIVO' }, async (q) => {
        expect(await q.query(`SELECT * FROM ${tabla}`)).toEqual([])
      })
    },
  )

  describe.each(UNIVERSIDADES.map((u) => u.dominio))(
    'con la universidad de %s fijada',
    (dominio) => {
      it.each(TABLAS)(
        '%s: una consulta sin filtro devuelve solo sus filas',
        async (tabla, columna) => {
          const universidadId = universidades[dominio]
          const propias = await idsDe(tabla, `WHERE ${columna} = $1`, [
            universidadId,
          ])
          expect(propias.length).toBeGreaterThan(0)

          await comoApp({ universidadId, rol: 'PROFESOR' }, async (q) => {
            const filas = await q.query<{ id: string }[]>(
              `SELECT id FROM ${tabla} ORDER BY id`,
            )
            expect(filas).toEqual(propias)
          })
        },
      )
    },
  )

  describe('escrituras', () => {
    const administrativo = () => ({
      universidadId: universidades[NORTE],
      rol: 'ADMINISTRATIVO' as const,
    })

    it('rechaza crear un registro en otra universidad', async () => {
      await comoApp(administrativo(), async (q) => {
        await expect(
          q.query(
            `INSERT INTO facultad (universidad_id, nombre) VALUES ($1, 'Intrusa')`,
            [universidades[SUR]],
          ),
        ).rejects.toMatchObject({ code: SIN_PERMISO })
      })
    })

    it('permite crear un registro en su universidad', async () => {
      await comoApp(administrativo(), async (q) => {
        await q.query(
          `INSERT INTO facultad (universidad_id, nombre) VALUES ($1, 'Nueva')`,
          [universidades[NORTE]],
        )
      })
    })

    it('no permite escribir sin un rol fijado', async () => {
      await comoApp({ universidadId: universidades[NORTE] }, async (q) => {
        await expect(
          q.query(
            `INSERT INTO facultad (universidad_id, nombre) VALUES ($1, 'Sin rol')`,
            [universidades[NORTE]],
          ),
        ).rejects.toMatchObject({ code: SIN_PERMISO })
      })
    })

    it('no ve ni modifica los registros de otra universidad', async () => {
      await comoApp(administrativo(), async (q) => {
        const [filas, afectadas] = await q.query<[unknown[], number]>(
          `UPDATE facultad SET nombre = 'Cambiada' WHERE universidad_id = $1`,
          [universidades[SUR]],
        )
        expect(filas).toEqual([])
        expect(afectadas).toBe(0)
      })
    })

    it('rechaza mover un registro propio a otra universidad', async () => {
      await comoApp(administrativo(), async (q) => {
        await expect(
          q.query(`UPDATE periodo SET universidad_id = $1`, [
            universidades[SUR],
          ]),
        ).rejects.toMatchObject({ code: SIN_PERMISO })
      })
    })

    it.each(TABLAS)('%s: no permite borrar', async (tabla) => {
      await comoApp(administrativo(), async (q) => {
        await expect(q.query(`DELETE FROM ${tabla}`)).rejects.toMatchObject({
          code: SIN_PERMISO,
        })
      })
    })

    it.each(['refresh_token', 'sesion_auth'])(
      '%s: no es accesible con el rol de la API',
      async (tabla) => {
        await comoApp(administrativo(), async (q) => {
          await expect(q.query(`SELECT * FROM ${tabla}`)).rejects.toMatchObject(
            { code: SIN_PERMISO },
          )
        })
      },
    )
  })
})

describe('Director (ADR 0001)', () => {
  it.each(TABLAS)(
    '%s: lee las filas de todas las universidades',
    async (tabla) => {
      const todas = await idsDe(tabla)
      await comoApp({ rol: 'DIRECTOR' }, async (q) => {
        expect(await q.query(`SELECT id FROM ${tabla} ORDER BY id`)).toEqual(
          todas,
        )
      })
    },
  )

  it('no puede crear registros, ni en su universidad', async () => {
    const universidadId = universidades[NORTE]
    await comoApp({ universidadId, rol: 'DIRECTOR' }, async (q) => {
      await expect(
        q.query(
          `INSERT INTO facultad (universidad_id, nombre) VALUES ($1, 'Del director')`,
          [universidadId],
        ),
      ).rejects.toMatchObject({ code: SIN_PERMISO })
    })
  })

  it('no puede crear cursos, ni en su universidad', async () => {
    const universidadId = universidades[NORTE]
    const [{ carrera, periodo }] = await bd.query<
      { carrera: string; periodo: string }[]
    >(
      `SELECT c.id AS carrera, p.id AS periodo FROM carrera c, periodo p
        WHERE c.universidad_id = $1 AND p.universidad_id = $1 LIMIT 1`,
      [universidadId],
    )
    await comoApp({ universidadId, rol: 'DIRECTOR' }, async (q) => {
      await expect(
        q.query(
          `INSERT INTO curso (universidad_id, carrera_id, periodo_id, codigo, nombre)
           VALUES ($1, $2, $3, 'DIR101', 'Del director')`,
          [universidadId, carrera, periodo],
        ),
      ).rejects.toMatchObject({ code: SIN_PERMISO })
    })
  })

  it.each(TABLAS)(
    '%s: no puede modificar registros, ni de su universidad',
    async (tabla) => {
      const universidadId = universidades[NORTE]
      await comoApp({ universidadId, rol: 'DIRECTOR' }, async (q) => {
        const [, afectadas] = await q.query<[unknown[], number]>(
          `UPDATE ${tabla} SET updated_at = now()`,
        )
        expect(afectadas).toBe(0)
      })
    },
  )

  it.each(['ADMINISTRATIVO', 'PROFESOR', 'AYUDANTE', 'ALUMNO'] as const)(
    'el rol %s no lee otras universidades',
    async (rol) => {
      const universidadId = universidades[NORTE]
      const propias = await idsDe('facultad', 'WHERE universidad_id = $1', [
        universidadId,
      ])
      await comoApp({ universidadId, rol }, async (q) => {
        expect(await q.query(`SELECT id FROM facultad ORDER BY id`)).toEqual(
          propias,
        )
      })
    },
  )
})

describe('contrato del schema', () => {
  // Toda tabla con datos de una universidad debe tener RLS y sus políticas de
  // lectura, inserción y modificación para la API. Si una migración nueva
  // agrega una tabla con universidad_id y se olvida, este test falla.
  it('toda tabla con universidad_id tiene RLS y sus políticas para la API', async () => {
    const tablas = await bd.query<
      { tabla: string; rls: boolean; comandos: string[] }[]
    >(
      `SELECT c.relname AS tabla, c.relrowsecurity AS rls,
              ARRAY(SELECT p.cmd FROM pg_policies p
                     WHERE p.schemaname = 'public' AND p.tablename = c.relname
                       AND $1 = ANY (p.roles)
                     ORDER BY p.cmd) AS comandos
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'
          AND (c.relname = 'universidad' OR EXISTS (
            SELECT FROM information_schema.columns col
             WHERE col.table_schema = 'public' AND col.table_name = c.relname
               AND col.column_name = 'universidad_id'))
        ORDER BY c.relname`,
      [ROL_APP],
    )

    expect(tablas.map((t) => t.tabla)).toEqual(
      [
        ...TABLAS.map(([tabla]) => tabla),
        'curso_cambio',
        'asignacion_cambio',
        // Sin filas en el seed: su RLS la prueba test/asistencia (ASI-01).
        'clase',
        // Sin filas en el seed: su RLS la prueba test/anuncios (ANU-01).
        'anuncio',
        'lectura_anuncio',
        // Sin filas en el seed: su RLS la prueba test/notas (NOT-01).
        'evaluacion',
        // Auditoría sin filas en el seed: test/notas/auditoria (NOT-04).
        'nota_cambio',
        // Sin filas en el seed: su RLS la prueba test/asistencia (ASI-02).
        'asistencia',
        // Sin filas en el seed: su RLS la prueba test/materiales (MAT-08).
        'actividad',
      ].sort(),
    )
    for (const tabla of tablas) {
      expect(tabla).toMatchObject({
        rls: true,
        // Las auditorías son de solo adición: no conceden UPDATE a la API.
        comandos: [
          'curso_cambio',
          'asignacion_cambio',
          'nota_cambio',
          'lectura_anuncio',
        ].includes(tabla.tabla)
          ? ['INSERT', 'SELECT']
          : ['INSERT', 'SELECT', 'UPDATE'],
      })
    }
  })

  it('el rol de la API no tiene DELETE sobre ninguna tabla', async () => {
    const permisos = await bd.query<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.role_table_grants
        WHERE grantee = $1 AND privilege_type IN ('DELETE', 'TRUNCATE')`,
      [ROL_APP],
    )
    expect(permisos).toEqual([])
  })
})
