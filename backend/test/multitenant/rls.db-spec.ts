import { DataSource, type QueryRunner } from 'typeorm'
import { opcionesDataSource } from '../../src/database/data-source.js'
import { ROL_APP } from '../../src/database/base-de-datos.service.js'
import { ejecutarSeed, UNIVERSIDADES } from '../../src/database/seed.js'

// Consultas directas a la base, sin pasar por la API: prueban que RLS aísla
// las universidades aunque una consulta no filtre por universidad.

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
] as const

let admin: DataSource
let bd: DataSource
const universidades: Record<string, string> = {}

// Ejecuta la prueba con el rol de la API, dentro de una transacción que se
// revierte al terminar. Sin universidadId, no fija ninguna universidad.
async function comoApp(
  universidadId: string | null,
  prueba: (q: QueryRunner) => Promise<void>,
) {
  const q = bd.createQueryRunner()
  await q.startTransaction()
  try {
    await q.query(`SET LOCAL ROLE ${ROL_APP}`)
    if (universidadId) {
      await q.query(`SELECT set_config('app.universidad_id', $1, true)`, [
        universidadId,
      ])
    }
    await prueba(q)
  } finally {
    await q.rollbackTransaction()
    await q.release()
  }
}

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
      await comoApp(null, async (q) => {
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
          // Lo que hay en la base, leído por el dueño de las tablas (sin RLS).
          const propias = await bd.query<{ id: string }[]>(
            `SELECT id FROM ${tabla} WHERE ${columna} = $1 ORDER BY id`,
            [universidadId],
          )
          expect(propias.length).toBeGreaterThan(0)

          await comoApp(universidadId, async (q) => {
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
    const [norte, sur] = UNIVERSIDADES.map((u) => u.dominio)

    it('rechaza crear un registro en otra universidad', async () => {
      await comoApp(universidades[norte], async (q) => {
        await expect(
          q.query(
            `INSERT INTO facultad (universidad_id, nombre) VALUES ($1, 'Intrusa')`,
            [universidades[sur]],
          ),
        ).rejects.toMatchObject({ code: SIN_PERMISO })
      })
    })

    it('permite crear un registro en su universidad', async () => {
      await comoApp(universidades[norte], async (q) => {
        await q.query(
          `INSERT INTO facultad (universidad_id, nombre) VALUES ($1, 'Nueva')`,
          [universidades[norte]],
        )
      })
    })

    it('no ve ni modifica los registros de otra universidad', async () => {
      await comoApp(universidades[norte], async (q) => {
        const [filas, afectadas] = await q.query<[unknown[], number]>(
          `UPDATE facultad SET nombre = 'Cambiada' WHERE universidad_id = $1`,
          [universidades[sur]],
        )
        expect(filas).toEqual([])
        expect(afectadas).toBe(0)
      })
    })

    it('rechaza mover un registro propio a otra universidad', async () => {
      await comoApp(universidades[norte], async (q) => {
        await expect(
          q.query(`UPDATE periodo SET universidad_id = $1`, [
            universidades[sur],
          ]),
        ).rejects.toMatchObject({ code: SIN_PERMISO })
      })
    })

    it.each(TABLAS)('%s: no permite borrar', async (tabla) => {
      await comoApp(universidades[norte], async (q) => {
        await expect(q.query(`DELETE FROM ${tabla}`)).rejects.toMatchObject({
          code: SIN_PERMISO,
        })
      })
    })

    it.each(['refresh_token', 'sesion_auth'])(
      '%s: no es accesible con el rol de la API',
      async (tabla) => {
        await comoApp(universidades[norte], async (q) => {
          await expect(q.query(`SELECT * FROM ${tabla}`)).rejects.toMatchObject(
            { code: SIN_PERMISO },
          )
        })
      },
    )
  })
})

describe('contrato del schema', () => {
  // Toda tabla con datos de una universidad debe tener RLS y su política.
  // Si una migración nueva agrega una tabla con universidad_id y se olvida,
  // este test falla.
  it('toda tabla con universidad_id tiene RLS y una política para la API', async () => {
    const tablas = await bd.query<
      { tabla: string; rls: boolean; politicas: number }[]
    >(
      `SELECT c.relname AS tabla, c.relrowsecurity AS rls,
              (SELECT count(*)::int FROM pg_policies p
                WHERE p.schemaname = 'public' AND p.tablename = c.relname
                  AND $1 = ANY (p.roles)) AS politicas
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
      TABLAS.map(([tabla]) => tabla).sort(),
    )
    for (const tabla of tablas) {
      expect(tabla).toMatchObject({ rls: true, politicas: 1 })
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
