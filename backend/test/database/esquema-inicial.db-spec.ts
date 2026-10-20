import { DataSource, type QueryRunner } from 'typeorm'
import { opcionesDataSource } from '../../src/database/data-source.js'

// Los tests corren en una base aparte que se crea y se borra en cada ejecución,
// para no tocar los datos de desarrollo al revertir la migración.
const BD_TEST = process.env.POSTGRES_TEST_DB ?? 'cursus_test'

// Códigos de error de PostgreSQL.
const NOT_NULL = '23502'
const FOREIGN_KEY = '23503'
const UNIQUE = '23505'
const CHECK = '23514'
const VALOR_INVALIDO = '22P02'

const HASH = '$2b$10$abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOP'
const TABLAS = [
  'ayudante_seccion',
  'carrera',
  'curso',
  'curso_cambio',
  'facultad',
  'inscripcion',
  'limite_login',
  'periodo',
  'refresh_token',
  'seccion',
  'sesion_auth',
  'universidad',
  'usuario',
]

let admin: DataSource
let bd: DataSource

async function recrearBaseDeTest() {
  if (BD_TEST === (process.env.POSTGRES_DB ?? 'cursus')) {
    throw new Error('POSTGRES_TEST_DB no puede ser la base de desarrollo')
  }
  await admin.query(`DROP DATABASE IF EXISTS "${BD_TEST}" WITH (FORCE)`)
  await admin.query(`CREATE DATABASE "${BD_TEST}"`)
}

// Cada test trabaja dentro de una transacción que se revierte al terminar.
async function enTransaccion(prueba: (q: QueryRunner) => Promise<void>) {
  const q = bd.createQueryRunner()
  await q.startTransaction()
  try {
    await prueba(q)
  } finally {
    await q.rollbackTransaction()
    await q.release()
  }
}

async function insertar(
  q: QueryRunner,
  sql: string,
  parametros: unknown[],
): Promise<string> {
  const filas = (await q.query(`${sql} RETURNING id`, parametros)) as {
    id: string
  }[]
  return filas[0].id
}

function crearUniversidad(q: QueryRunner, nombre: string, dominio: string) {
  return insertar(
    q,
    'INSERT INTO universidad (nombre, dominio_correo) VALUES ($1, $2)',
    [nombre, dominio],
  )
}

function crearFacultad(q: QueryRunner, universidadId: string, nombre: string) {
  return insertar(
    q,
    'INSERT INTO facultad (universidad_id, nombre) VALUES ($1, $2)',
    [universidadId, nombre],
  )
}

function crearUsuario(
  q: QueryRunner,
  datos: {
    universidadId: string | null
    correo: string
    rol?: string | null
    facultadId?: string | null
    passwordHash?: string
  },
) {
  return insertar(
    q,
    `INSERT INTO usuario (universidad_id, facultad_id, nombre, correo, password_hash, rol)
     VALUES ($1, $2, 'Usuario de prueba', $3, $4, $5)`,
    [
      datos.universidadId,
      datos.facultadId ?? null,
      datos.correo,
      datos.passwordHash ?? HASH,
      datos.rol === undefined ? 'ALUMNO' : datos.rol,
    ],
  )
}

function crearPeriodo(
  q: QueryRunner,
  datos: {
    universidadId: string
    anio: number
    semestre: number
    inicio: string
    termino: string
    activo: boolean
  },
) {
  return insertar(
    q,
    `INSERT INTO periodo (universidad_id, anio, semestre, fecha_inicio, fecha_termino, activo)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      datos.universidadId,
      datos.anio,
      datos.semestre,
      datos.inicio,
      datos.termino,
      datos.activo,
    ],
  )
}

async function tablasExistentes(): Promise<string[]> {
  const filas = await bd.query<{ table_name: string }[]>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name <> 'migraciones'
     ORDER BY table_name`,
  )
  return filas.map((fila) => fila.table_name)
}

beforeAll(async () => {
  admin = await new DataSource(opcionesDataSource()).initialize()
  await recrearBaseDeTest()
  bd = await new DataSource(opcionesDataSource(BD_TEST)).initialize()
  await bd.runMigrations()
})

afterAll(async () => {
  await bd?.destroy()
  if (admin?.isInitialized) {
    await admin.query(`DROP DATABASE IF EXISTS "${BD_TEST}" WITH (FORCE)`)
    await admin.destroy()
  }
})

describe('migraciones', () => {
  it('se aplican y se revierten', async () => {
    expect(await tablasExistentes()).toEqual(TABLAS)

    // La asignación de ayudantes se revierte antes de sus claves foráneas.
    await bd.undoLastMigration()
    const SIN_AYUDANTES = TABLAS.filter((tabla) => tabla !== 'ayudante_seccion')
    expect(await tablasExistentes()).toEqual(SIN_AYUDANTES)
    await bd.undoLastMigration() // CrearHistorialCurso.
    const SIN_HISTORIAL = SIN_AYUDANTES.filter(
      (tabla) => tabla !== 'curso_cambio',
    )
    expect(await tablasExistentes()).toEqual(SIN_HISTORIAL)
    // CrearInscripcion es ahora la última.
    await bd.undoLastMigration()
    const SIN_INSCRIPCION = SIN_HISTORIAL.filter(
      (tabla) => tabla !== 'inscripcion',
    )
    expect(await tablasExistentes()).toEqual(SIN_INSCRIPCION)
    const [{ restricciones }] = await bd.query<{ restricciones: string }[]>(
      `SELECT count(*) AS restricciones FROM pg_constraint
        WHERE conname IN ('uq_seccion_id_universidad', 'uq_usuario_id_universidad')`,
    )
    expect(Number(restricciones)).toBe(0)

    await bd.undoLastMigration() // CodigoCursoUnicoNormalizado.

    // CrearSeccion es ahora la última.
    await bd.undoLastMigration()
    const SIN_SECCION = SIN_INSCRIPCION.filter((tabla) => tabla !== 'seccion')
    expect(await tablasExistentes()).toEqual(SIN_SECCION)

    await bd.undoLastMigration() // NombreCarreraUnicoNormalizado.

    // CrearCurso es ahora la última.
    await bd.undoLastMigration()
    const SIN_CURSO = SIN_SECCION.filter((tabla) => tabla !== 'curso')
    expect(await tablasExistentes()).toEqual(SIN_CURSO)

    // Se revierten en orden inverso a su aplicación. PermitirLecturaDirector,
    // ActivarRls y AgregarArchivado no crean tablas.
    await bd.undoLastMigration()
    await bd.undoLastMigration()
    await bd.undoLastMigration()
    expect(await tablasExistentes()).toEqual(SIN_CURSO)

    await bd.query(
      `INSERT INTO limite_login (clave, fallos) VALUES (repeat('a', 64), ARRAY(SELECT clock_timestamp() FROM generate_series(1, 20)))`,
    )
    await bd.undoLastMigration()
    const [{ cantidad }] = await bd.query<{ cantidad: number }[]>(
      'SELECT cardinality(fallos) AS cantidad FROM limite_login',
    )
    expect(cantidad).toBe(5)
    expect(await tablasExistentes()).toEqual(SIN_CURSO)
    await bd.undoLastMigration()
    expect(await tablasExistentes()).toEqual(
      SIN_CURSO.filter((tabla) => tabla !== 'limite_login'),
    )
    await bd.undoLastMigration()
    expect(await tablasExistentes()).toEqual(
      SIN_CURSO.filter(
        (tabla) => tabla !== 'sesion_auth' && tabla !== 'limite_login',
      ),
    )
    await bd.undoLastMigration()
    expect(await tablasExistentes()).toEqual(
      SIN_CURSO.filter(
        (tabla) =>
          tabla !== 'refresh_token' &&
          tabla !== 'sesion_auth' &&
          tabla !== 'limite_login',
      ),
    )
    await bd.undoLastMigration()
    expect(await tablasExistentes()).toEqual([])
    const [{ restos }] = await bd.query<{ restos: string }[]>(
      `SELECT (SELECT count(*) FROM pg_type WHERE typname = 'rol_usuario')
            + (SELECT count(*) FROM pg_proc WHERE proname = 'actualizar_updated_at')
            + (SELECT count(*) FROM pg_proc WHERE proname = 'universidad_actual')
            + (SELECT count(*) FROM pg_proc WHERE proname = 'rol_actual')
              AS restos`,
    )
    expect(Number(restos)).toBe(0)

    await bd.runMigrations()
    expect(await tablasExistentes()).toEqual(TABLAS)
  })

  it('agrega id uuid, created_at y updated_at a todas las tablas', async () => {
    const filas = await bd.query<
      { table_name: string; column_name: string; data_type: string }[]
    >(
      `SELECT table_name, column_name, data_type FROM information_schema.columns
       WHERE table_schema = 'public' AND column_name IN ('id', 'created_at', 'updated_at')`,
    )

    // refresh_token usa creado_en y no tiene updated_at: sus filas no cambian
    // salvo revocado_en.
    for (const tabla of TABLAS.filter(
      (t) =>
        t !== 'refresh_token' &&
        t !== 'sesion_auth' &&
        t !== 'limite_login' &&
        t !== 'curso_cambio',
    )) {
      const columnas = filas.filter((fila) => fila.table_name === tabla)
      expect(columnas).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ column_name: 'id', data_type: 'uuid' }),
          expect.objectContaining({ column_name: 'created_at' }),
          expect.objectContaining({ column_name: 'updated_at' }),
        ]),
      )
    }
  })

  it('agrega archived_at opcional a las tablas que se archivan', async () => {
    const filas = await bd.query<
      { table_name: string; data_type: string; is_nullable: string }[]
    >(
      `SELECT table_name, data_type, is_nullable FROM information_schema.columns
       WHERE table_schema = 'public' AND column_name = 'archived_at'
       ORDER BY table_name`,
    )
    expect(filas).toEqual(
      [
        'ayudante_seccion',
        'carrera',
        'curso',
        'facultad',
        'inscripcion',
        'seccion',
        'universidad',
        'usuario',
      ].map((tabla) => ({
        table_name: tabla,
        data_type: 'timestamp with time zone',
        is_nullable: 'YES',
      })),
    )
  })

  it('indexa la FK compuesta de usuario a facultad', async () => {
    const [indice] = await bd.query<{ indexdef: string }[]>(
      `SELECT indexdef FROM pg_indexes
       WHERE schemaname = 'public' AND indexname = 'ix_usuario_facultad'`,
    )
    expect(indice?.indexdef).toContain('(facultad_id, universidad_id)')
  })
})

describe('facultad', () => {
  it('rechaza una facultad sin universidad', () =>
    enTransaccion(async (q) => {
      await expect(
        q.query("INSERT INTO facultad (nombre) VALUES ('Ingeniería')"),
      ).rejects.toMatchObject({ code: NOT_NULL, column: 'universidad_id' })
    }))

  it('rechaza una facultad con una universidad inexistente', () =>
    enTransaccion(async (q) => {
      await expect(
        crearFacultad(q, '00000000-0000-0000-0000-000000000000', 'Ingeniería'),
      ).rejects.toMatchObject({
        code: FOREIGN_KEY,
        constraint: 'fk_facultad_universidad',
      })
    }))

  it('no repite el nombre dentro de la misma universidad', () =>
    enTransaccion(async (q) => {
      const ua = await crearUniversidad(q, 'Universidad A', 'ua.cl')
      const ub = await crearUniversidad(q, 'Universidad B', 'ub.cl')
      await crearFacultad(q, ua, 'Ingeniería')
      await crearFacultad(q, ub, 'Ingeniería')

      await expect(crearFacultad(q, ua, 'Ingeniería')).rejects.toMatchObject({
        code: UNIQUE,
        constraint: 'uq_facultad_universidad_nombre',
      })
    }))
})

describe('carrera', () => {
  const sqlCarrera =
    'INSERT INTO carrera (universidad_id, facultad_id, nombre) VALUES ($1, $2, $3)'

  it('rechaza una carrera sin universidad', () =>
    enTransaccion(async (q) => {
      const ua = await crearUniversidad(q, 'Universidad A', 'ua.cl')
      const ing = await crearFacultad(q, ua, 'Ingeniería')
      await expect(
        insertar(q, sqlCarrera, [null, ing, 'Civil']),
      ).rejects.toMatchObject({ code: NOT_NULL, column: 'universidad_id' })
    }))

  it('rechaza una carrera sin facultad', () =>
    enTransaccion(async (q) => {
      const ua = await crearUniversidad(q, 'Universidad A', 'ua.cl')
      await expect(
        insertar(q, sqlCarrera, [ua, null, 'Civil']),
      ).rejects.toMatchObject({ code: NOT_NULL, column: 'facultad_id' })
    }))

  it('rechaza una facultad de otra universidad', () =>
    enTransaccion(async (q) => {
      const ua = await crearUniversidad(q, 'Universidad A', 'ua.cl')
      const ub = await crearUniversidad(q, 'Universidad B', 'ub.cl')
      const ingA = await crearFacultad(q, ua, 'Ingeniería')
      await insertar(q, sqlCarrera, [ua, ingA, 'Civil'])

      await expect(
        insertar(q, sqlCarrera, [ub, ingA, 'Comercial']),
      ).rejects.toMatchObject({
        code: FOREIGN_KEY,
        constraint: 'fk_carrera_facultad',
      })
    }))

  it('no repite el nombre dentro de la misma facultad', () =>
    enTransaccion(async (q) => {
      const ua = await crearUniversidad(q, 'Universidad A', 'ua.cl')
      const ing = await crearFacultad(q, ua, 'Ingeniería')
      const cs = await crearFacultad(q, ua, 'Ciencias')
      await insertar(q, sqlCarrera, [ua, ing, 'Civil'])
      await insertar(q, sqlCarrera, [ua, cs, 'Civil'])

      await expect(
        insertar(q, sqlCarrera, [ua, ing, 'Civil']),
      ).rejects.toMatchObject({
        code: UNIQUE,
        constraint: 'uq_carrera_facultad_nombre',
      })
    }))
})

describe('usuario', () => {
  it('rechaza un usuario sin universidad', () =>
    enTransaccion(async (q) => {
      await expect(
        crearUsuario(q, { universidadId: null, correo: 'ana@ua.cl' }),
      ).rejects.toMatchObject({ code: NOT_NULL, column: 'universidad_id' })
    }))

  it('rechaza un usuario sin rol', () =>
    enTransaccion(async (q) => {
      const ua = await crearUniversidad(q, 'Universidad A', 'ua.cl')
      await expect(
        crearUsuario(q, { universidadId: ua, correo: 'ana@ua.cl', rol: null }),
      ).rejects.toMatchObject({ code: NOT_NULL, column: 'rol' })
    }))

  it('rechaza un rol fuera del enum', () =>
    enTransaccion(async (q) => {
      const ua = await crearUniversidad(q, 'Universidad A', 'ua.cl')
      await expect(
        crearUsuario(q, {
          universidadId: ua,
          correo: 'ana@ua.cl',
          rol: 'ADMIN',
        }),
      ).rejects.toMatchObject({ code: VALOR_INVALIDO })
    }))

  it('acepta cada uno de los cinco roles', () =>
    enTransaccion(async (q) => {
      const ua = await crearUniversidad(q, 'Universidad A', 'ua.cl')
      const ing = await crearFacultad(q, ua, 'Ingeniería')
      const roles = [
        'DIRECTOR',
        'ADMINISTRATIVO',
        'PROFESOR',
        'AYUDANTE',
        'ALUMNO',
      ]
      for (const rol of roles) {
        await crearUsuario(q, {
          universidadId: ua,
          facultadId: rol === 'ADMINISTRATIVO' ? ing : null,
          correo: `${rol}@ua.cl`,
          rol,
        })
      }
    }))

  it('rechaza un administrativo sin facultad', () =>
    enTransaccion(async (q) => {
      const ua = await crearUniversidad(q, 'Universidad A', 'ua.cl')
      await expect(
        crearUsuario(q, {
          universidadId: ua,
          correo: 'adm@ua.cl',
          rol: 'ADMINISTRATIVO',
        }),
      ).rejects.toMatchObject({
        code: CHECK,
        constraint: 'ck_usuario_administrativo_facultad',
      })
    }))

  it('permite que otros roles tengan facultad', () =>
    enTransaccion(async (q) => {
      const ua = await crearUniversidad(q, 'Universidad A', 'ua.cl')
      const ing = await crearFacultad(q, ua, 'Ingeniería')
      await crearUsuario(q, {
        universidadId: ua,
        facultadId: ing,
        correo: 'profe@ua.cl',
        rol: 'PROFESOR',
      })
    }))

  it('rechaza una facultad de otra universidad', () =>
    enTransaccion(async (q) => {
      const ua = await crearUniversidad(q, 'Universidad A', 'ua.cl')
      const ub = await crearUniversidad(q, 'Universidad B', 'ub.cl')
      const facultadA = await crearFacultad(q, ua, 'Ingeniería')
      await crearUsuario(q, {
        universidadId: ua,
        facultadId: facultadA,
        correo: 'adm@ua.cl',
        rol: 'ADMINISTRATIVO',
      })

      await expect(
        crearUsuario(q, {
          universidadId: ub,
          facultadId: facultadA,
          correo: 'adm@ub.cl',
          rol: 'ADMINISTRATIVO',
        }),
      ).rejects.toMatchObject({
        code: FOREIGN_KEY,
        constraint: 'fk_usuario_facultad',
      })
    }))
})

describe('contraseñas', () => {
  it('no existe ninguna columna de contraseña en texto plano', async () => {
    const filas = await bd.query<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'usuario'
         AND (column_name ILIKE '%password%' OR column_name ILIKE '%contrasena%'
              OR column_name ILIKE '%clave%')`,
    )
    expect(filas.map((fila) => fila.column_name)).toEqual(['password_hash'])
  })

  it('rechaza un password_hash en texto plano', () =>
    enTransaccion(async (q) => {
      const ua = await crearUniversidad(q, 'Universidad A', 'ua.cl')
      await expect(
        crearUsuario(q, {
          universidadId: ua,
          correo: 'ana@ua.cl',
          passwordHash: 'secreta123',
        }),
      ).rejects.toMatchObject({
        code: CHECK,
        constraint: 'ck_usuario_password_hash',
      })
    }))

  it('acepta hashes con formato bcrypt y argon2', () =>
    enTransaccion(async (q) => {
      const ua = await crearUniversidad(q, 'Universidad A', 'ua.cl')
      await crearUsuario(q, { universidadId: ua, correo: 'bcrypt@ua.cl' })
      await crearUsuario(q, {
        universidadId: ua,
        correo: 'argon2@ua.cl',
        passwordHash:
          '$argon2id$v=19$m=65536,t=3,p=4$c2FsdHNhbHRzYWx0$aGFzaGhhc2hoYXNoaGFzaA',
      })
    }))
})

describe('correo de usuario', () => {
  it('acepta el mismo correo en otra universidad', () =>
    enTransaccion(async (q) => {
      const ua = await crearUniversidad(q, 'Universidad A', 'ua.cl')
      const ub = await crearUniversidad(q, 'Universidad B', 'ub.cl')
      await crearUsuario(q, { universidadId: ua, correo: 'ana@correo.cl' })
      await crearUsuario(q, { universidadId: ub, correo: 'ana@correo.cl' })
    }))

  it('rechaza un correo repetido en la misma universidad', () =>
    enTransaccion(async (q) => {
      const ua = await crearUniversidad(q, 'Universidad A', 'ua.cl')
      await crearUsuario(q, { universidadId: ua, correo: 'ana@ua.cl' })

      await expect(
        crearUsuario(q, { universidadId: ua, correo: 'ana@ua.cl' }),
      ).rejects.toMatchObject({
        code: UNIQUE,
        constraint: 'ux_usuario_universidad_correo',
      })
    }))

  it('rechaza el correo repetido aunque cambien las mayúsculas', () =>
    enTransaccion(async (q) => {
      const ua = await crearUniversidad(q, 'Universidad A', 'ua.cl')
      await crearUsuario(q, { universidadId: ua, correo: 'ana@ua.cl' })

      await expect(
        crearUsuario(q, { universidadId: ua, correo: 'Ana@UA.cl' }),
      ).rejects.toMatchObject({
        code: UNIQUE,
        constraint: 'ux_usuario_universidad_correo',
      })
    }))
})

describe('periodo', () => {
  const segundo2026 = {
    anio: 2026,
    semestre: 2,
    inicio: '2026-08-01',
    termino: '2026-12-15',
  }
  const primero2027 = {
    anio: 2027,
    semestre: 1,
    inicio: '2027-03-01',
    termino: '2027-07-15',
  }

  it('rechaza dos períodos activos en la misma universidad', () =>
    enTransaccion(async (q) => {
      const ua = await crearUniversidad(q, 'Universidad A', 'ua.cl')
      const ub = await crearUniversidad(q, 'Universidad B', 'ub.cl')
      await crearPeriodo(q, { universidadId: ua, ...segundo2026, activo: true })
      await crearPeriodo(q, { universidadId: ub, ...segundo2026, activo: true })
      await crearPeriodo(q, {
        universidadId: ua,
        ...primero2027,
        activo: false,
      })

      await expect(
        q.query(
          `UPDATE periodo SET activo = true
           WHERE universidad_id = $1 AND anio = 2027`,
          [ua],
        ),
      ).rejects.toMatchObject({
        code: UNIQUE,
        constraint: 'ux_periodo_activo_por_universidad',
      })
    }))

  it('rechaza un período que termina antes de empezar', () =>
    enTransaccion(async (q) => {
      const ua = await crearUniversidad(q, 'Universidad A', 'ua.cl')
      await expect(
        crearPeriodo(q, {
          universidadId: ua,
          ...primero2027,
          inicio: '2027-07-15',
          termino: '2027-03-01',
          activo: false,
        }),
      ).rejects.toMatchObject({ code: CHECK, constraint: 'ck_periodo_fechas' })
    }))

  it('rechaza un semestre distinto de 1 o 2', () =>
    enTransaccion(async (q) => {
      const ua = await crearUniversidad(q, 'Universidad A', 'ua.cl')
      await expect(
        crearPeriodo(q, {
          universidadId: ua,
          ...primero2027,
          semestre: 3,
          activo: false,
        }),
      ).rejects.toMatchObject({
        code: CHECK,
        constraint: 'ck_periodo_semestre',
      })
    }))

  it('no repite año y semestre en la misma universidad', () =>
    enTransaccion(async (q) => {
      const ua = await crearUniversidad(q, 'Universidad A', 'ua.cl')
      await crearPeriodo(q, {
        universidadId: ua,
        ...segundo2026,
        activo: false,
      })

      await expect(
        crearPeriodo(q, { universidadId: ua, ...segundo2026, activo: false }),
      ).rejects.toMatchObject({
        code: UNIQUE,
        constraint: 'uq_periodo_universidad_anio_semestre',
      })
    }))
})

describe('refresh_token', () => {
  it('rechaza un hash que no es sha256 en hex', () =>
    enTransaccion(async (q) => {
      const universidadId = await crearUniversidad(q, 'U', 'u.cl')
      const usuarioId = await crearUsuario(q, {
        universidadId,
        correo: 'a@u.cl',
      })
      await expect(
        q.query(
          `INSERT INTO refresh_token (usuario_id, hash, expira_en)
           VALUES ($1, 'token-en-texto-plano', now())`,
          [usuarioId],
        ),
      ).rejects.toMatchObject({
        code: CHECK,
        constraint: 'ck_refresh_token_hash',
      })
    }))
})

describe('seccion', () => {
  // Universidad con un curso, para crear secciones.
  async function crearCursoBase(q: QueryRunner, dominio: string) {
    const universidadId = await crearUniversidad(q, `U ${dominio}`, dominio)
    const facultadId = await crearFacultad(q, universidadId, 'Ingeniería')
    const carreraId = await insertar(
      q,
      `INSERT INTO carrera (universidad_id, facultad_id, nombre)
       VALUES ($1, $2, 'Informática')`,
      [universidadId, facultadId],
    )
    const periodoId = await insertar(
      q,
      `INSERT INTO periodo (universidad_id, anio, semestre, fecha_inicio, fecha_termino)
       VALUES ($1, 2026, 2, '2026-08-03', '2026-12-18')`,
      [universidadId],
    )
    const cursoId = await insertar(
      q,
      `INSERT INTO curso (universidad_id, carrera_id, periodo_id, codigo, nombre)
       VALUES ($1, $2, $3, 'ICC101', 'Programación')`,
      [universidadId, carreraId, periodoId],
    )
    return { universidadId, cursoId }
  }

  const crearSeccion = (
    q: QueryRunner,
    datos: { universidadId: string; cursoId: string; numero: number },
  ) =>
    insertar(
      q,
      'INSERT INTO seccion (universidad_id, curso_id, numero) VALUES ($1, $2, $3)',
      [datos.universidadId, datos.cursoId, datos.numero],
    )

  it('rechaza un curso de otra universidad', () =>
    enTransaccion(async (q) => {
      const a = await crearCursoBase(q, 'a.cl')
      const b = await crearCursoBase(q, 'b.cl')
      await expect(
        crearSeccion(q, { ...a, cursoId: b.cursoId, numero: 1 }),
      ).rejects.toMatchObject({
        code: FOREIGN_KEY,
        constraint: 'fk_seccion_curso',
      })
    }))

  it('no repite el número en el mismo curso', () =>
    enTransaccion(async (q) => {
      const base = await crearCursoBase(q, 'a.cl')
      await crearSeccion(q, { ...base, numero: 1 })
      await expect(
        crearSeccion(q, { ...base, numero: 1 }),
      ).rejects.toMatchObject({
        code: UNIQUE,
        constraint: 'uq_seccion_curso_numero',
      })
    }))

  it('rechaza un número menor que 1', () =>
    enTransaccion(async (q) => {
      const base = await crearCursoBase(q, 'a.cl')
      await expect(
        crearSeccion(q, { ...base, numero: 0 }),
      ).rejects.toMatchObject({ code: CHECK, constraint: 'ck_seccion_numero' })
    }))

  describe('inscripcion', () => {
    // Una sección y un alumno de la misma universidad.
    async function crearBase(q: QueryRunner, dominio: string) {
      const base = await crearCursoBase(q, dominio)
      const seccionId = await crearSeccion(q, { ...base, numero: 1 })
      const usuarioId = await crearUsuario(q, {
        universidadId: base.universidadId,
        correo: `alumno@${dominio}`,
      })
      return { universidadId: base.universidadId, seccionId, usuarioId }
    }

    const inscribir = (
      q: QueryRunner,
      datos: { universidadId: string; seccionId: string; usuarioId: string },
    ) =>
      insertar(
        q,
        'INSERT INTO inscripcion (universidad_id, seccion_id, usuario_id) VALUES ($1, $2, $3)',
        [datos.universidadId, datos.seccionId, datos.usuarioId],
      )

    it('rechaza una sección de otra universidad', () =>
      enTransaccion(async (q) => {
        const a = await crearBase(q, 'a.cl')
        const b = await crearBase(q, 'b.cl')
        await expect(
          inscribir(q, { ...a, seccionId: b.seccionId }),
        ).rejects.toMatchObject({
          code: FOREIGN_KEY,
          constraint: 'fk_inscripcion_seccion',
        })
      }))

    it('rechaza un alumno de otra universidad', () =>
      enTransaccion(async (q) => {
        const a = await crearBase(q, 'a.cl')
        const b = await crearBase(q, 'b.cl')
        await expect(
          inscribir(q, { ...a, usuarioId: b.usuarioId }),
        ).rejects.toMatchObject({
          code: FOREIGN_KEY,
          constraint: 'fk_inscripcion_usuario',
        })
      }))

    it('no inscribe dos veces al mismo alumno, salvo si la anterior está archivada', () =>
      enTransaccion(async (q) => {
        const base = await crearBase(q, 'a.cl')
        const id = await inscribir(q, base)
        // El savepoint deja seguir la transacción después del error.
        await q.query('SAVEPOINT repetida')
        await expect(inscribir(q, base)).rejects.toMatchObject({
          code: UNIQUE,
          constraint: 'ux_inscripcion_seccion_usuario',
        })
        await q.query('ROLLBACK TO SAVEPOINT repetida')
        await q.query(
          'UPDATE inscripcion SET archived_at = now() WHERE id = $1',
          [id],
        )
        await expect(inscribir(q, base)).resolves.toEqual(expect.any(String))
      }))
  })
})
