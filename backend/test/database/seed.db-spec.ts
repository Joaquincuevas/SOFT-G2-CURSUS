import { verify } from 'argon2'
import { DataSource } from 'typeorm'
import { opcionesDataSource } from '../../src/database/data-source.js'
import {
  correoDe,
  ejecutarSeed,
  ROLES,
  UNIVERSIDADES,
} from '../../src/database/seed.js'

// Base propia, distinta de la de esquema-inicial.db-spec.ts, que se crea y se
// borra en cada ejecución.
const BD_TEST = `${process.env.POSTGRES_TEST_DB ?? 'cursus_test'}_seed`
const PASSWORD = 'contraseña-de-prueba'

let admin: DataSource
let bd: DataSource

async function contar(tabla: string): Promise<number> {
  const [{ total }] = await bd.query<{ total: string }[]>(
    `SELECT count(*) AS total FROM ${tabla}`,
  )
  return Number(total)
}

async function conteos() {
  const tablas = ['universidad', 'facultad', 'carrera', 'periodo', 'usuario']
  return Object.fromEntries(
    await Promise.all(tablas.map(async (t) => [t, await contar(t)])),
  ) as Record<string, number>
}

beforeAll(async () => {
  admin = await new DataSource(opcionesDataSource()).initialize()
  await admin.query(`DROP DATABASE IF EXISTS "${BD_TEST}" WITH (FORCE)`)
  await admin.query(`CREATE DATABASE "${BD_TEST}"`)
  bd = await new DataSource(opcionesDataSource(BD_TEST)).initialize()
})

afterAll(async () => {
  await bd?.destroy()
  if (admin?.isInitialized) {
    await admin.query(`DROP DATABASE IF EXISTS "${BD_TEST}" WITH (FORCE)`)
    await admin.destroy()
  }
})

describe('seed de datos simulados', () => {
  it('se niega a correr con migraciones pendientes', async () => {
    await expect(ejecutarSeed(bd, PASSWORD)).rejects.toThrow(
      /migraciones pendientes/,
    )
  })

  it('crea dos universidades con facultad, carrera y período activo', async () => {
    await bd.runMigrations()
    await ejecutarSeed(bd, PASSWORD)

    const filas = await bd.query<
      {
        dominio_correo: string
        facultades: string
        carreras: string
        periodos_activos: string
      }[]
    >(
      `SELECT u.dominio_correo,
              (SELECT count(*) FROM facultad f WHERE f.universidad_id = u.id) AS facultades,
              (SELECT count(*) FROM carrera c WHERE c.universidad_id = u.id) AS carreras,
              (SELECT count(*) FROM periodo p WHERE p.universidad_id = u.id AND p.activo) AS periodos_activos
       FROM universidad u ORDER BY u.dominio_correo`,
    )

    expect(filas.map((f) => f.dominio_correo)).toEqual(
      UNIVERSIDADES.map((u) => u.dominio).sort(),
    )
    for (const fila of filas) {
      expect(Number(fila.facultades)).toBeGreaterThanOrEqual(1)
      expect(Number(fila.carreras)).toBeGreaterThanOrEqual(1)
      expect(Number(fila.periodos_activos)).toBe(1)
    }
  })

  it('crea un usuario por rol en cada universidad', async () => {
    for (const u of UNIVERSIDADES) {
      const filas = await bd.query<{ rol: string; correo: string }[]>(
        `SELECT us.rol, us.correo FROM usuario us
         JOIN universidad un ON un.id = us.universidad_id
         WHERE un.dominio_correo = $1 ORDER BY us.rol`,
        [u.dominio],
      )
      expect(filas).toEqual(
        ROLES.map(({ rol }) => ({ rol, correo: correoDe(rol, u.dominio) })),
      )
    }
  })

  it('guarda la contraseña hasheada con argon2id', async () => {
    const usuarios = await bd.query<{ password_hash: string }[]>(
      'SELECT password_hash FROM usuario',
    )
    for (const { password_hash } of usuarios) {
      expect(password_hash).toMatch(/^\$argon2id\$/)
      expect(await verify(password_hash, PASSWORD)).toBe(true)
    }
  })

  it('no duplica datos al ejecutarse de nuevo', async () => {
    const antes = await conteos()
    await ejecutarSeed(bd, PASSWORD)
    expect(await conteos()).toEqual(antes)
    expect(antes.usuario).toBe(UNIVERSIDADES.length * ROLES.length)
  })
})
