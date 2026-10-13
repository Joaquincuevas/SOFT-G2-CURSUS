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
const TABLAS = ['carrera', 'facultad', 'periodo', 'universidad', 'usuario']

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

describe('migración EsquemaInicial', () => {
  it('se aplica y se revierte', async () => {
    expect(await tablasExistentes()).toEqual(TABLAS)

    await bd.undoLastMigration()
    expect(await tablasExistentes()).toEqual([])
    const [{ restos }] = await bd.query<{ restos: string }[]>(
      `SELECT (SELECT count(*) FROM pg_type WHERE typname = 'rol_usuario')
            + (SELECT count(*) FROM pg_proc WHERE proname = 'actualizar_updated_at')
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

    for (const tabla of TABLAS) {
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
  it('rechaza una carrera sin facultad', () =>
    enTransaccion(async (q) => {
      await expect(
        q.query("INSERT INTO carrera (nombre) VALUES ('Ingeniería Civil')"),
      ).rejects.toMatchObject({ code: NOT_NULL, column: 'facultad_id' })
    }))

  it('no repite el nombre dentro de la misma facultad', () =>
    enTransaccion(async (q) => {
      const ua = await crearUniversidad(q, 'Universidad A', 'ua.cl')
      const ing = await crearFacultad(q, ua, 'Ingeniería')
      const cs = await crearFacultad(q, ua, 'Ciencias')
      const sql = 'INSERT INTO carrera (facultad_id, nombre) VALUES ($1, $2)'
      await insertar(q, sql, [ing, 'Civil'])
      await insertar(q, sql, [cs, 'Civil'])

      await expect(insertar(q, sql, [ing, 'Civil'])).rejects.toMatchObject({
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
          correo: `${rol}@ua.cl`,
          rol,
        })
      }
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
