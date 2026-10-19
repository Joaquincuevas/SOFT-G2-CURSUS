import { DataSource } from 'typeorm'
import {
  BaseDeDatos,
  type ContextoUniversidad,
} from '../../src/database/base-de-datos.service.js'
import { opcionesDataSource } from '../../src/database/data-source.js'
import { ejecutarSeed, UNIVERSIDADES } from '../../src/database/seed.js'

// El rol de la API, la universidad, el rol de la sesión y el modo READ ONLY
// se fijan solo dentro de la transacción de cada consulta institucional. Con
// un pool de una sola conexión, la consulta siguiente reutiliza la misma:
// nada de eso debe quedar fijado, ni después de un commit ni de un rollback.

// Base propia con el seed cargado, que se crea y se borra en cada ejecución.
const BD_TEST = `${process.env.POSTGRES_TEST_DB ?? 'cursus_test'}_pool`

let admin: DataSource
let bd: BaseDeDatos
let contexto: ContextoUniversidad

interface EstadoConexion {
  pid: number
  usuario: string
  universidad: string | null
  rol: string | null
  solo_lectura: string
}

// Lo que queda fijado en la conexión, leído fuera de cualquier transacción.
async function estadoConexion(): Promise<EstadoConexion> {
  const [estado] = await bd.query<EstadoConexion>(
    `SELECT pg_backend_pid() AS pid, current_user AS usuario,
            NULLIF(current_setting('app.universidad_id', true), '') AS universidad,
            NULLIF(current_setting('app.rol', true), '') AS rol,
            current_setting('transaction_read_only') AS solo_lectura`,
  )
  return estado
}

beforeAll(async () => {
  admin = await new DataSource(opcionesDataSource()).initialize()
  await admin.query(`DROP DATABASE IF EXISTS "${BD_TEST}" WITH (FORCE)`)
  await admin.query(`CREATE DATABASE "${BD_TEST}"`)
  const semilla = await new DataSource(opcionesDataSource(BD_TEST)).initialize()
  await semilla.runMigrations()
  await ejecutarSeed(semilla, 'contraseña-de-prueba')
  const [{ id }] = await semilla.query<{ id: string }[]>(
    'SELECT id FROM universidad WHERE dominio_correo = $1',
    [UNIVERSIDADES[0].dominio],
  )
  await semilla.destroy()
  contexto = { universidadId: id, rol: 'ADMINISTRATIVO' }

  // BaseDeDatos con un pool de una sola conexión, para forzar que todas las
  // consultas la reutilicen.
  bd = new BaseDeDatos()
  Object.assign(bd, {
    conexion: new DataSource({
      ...opcionesDataSource(BD_TEST),
      extra: { max: 1 },
    }).initialize(),
  })
})

afterAll(async () => {
  await bd?.onModuleDestroy()
  if (admin?.isInitialized) {
    await admin.query(`DROP DATABASE IF EXISTS "${BD_TEST}" WITH (FORCE)`)
    await admin.destroy()
  }
})

describe('conexión reutilizada del pool', () => {
  let limpio: EstadoConexion

  beforeAll(async () => {
    limpio = await estadoConexion()
    expect(limpio).toMatchObject({
      universidad: null,
      rol: null,
      solo_lectura: 'off',
    })
  })

  it('queda limpia después de una consulta institucional (commit)', async () => {
    const filas = await bd.consultarEnUniversidad<{ id: string }>(
      contexto,
      'SELECT id FROM facultad WHERE universidad_id = $1',
    )
    expect(filas.length).toBeGreaterThan(0)

    expect(await estadoConexion()).toEqual(limpio)
  })

  it('queda limpia después de una consulta que falla (rollback)', async () => {
    await expect(
      bd.consultarEnUniversidad(
        contexto,
        `INSERT INTO facultad (universidad_id, nombre) VALUES ($1, NULL)`,
      ),
    ).rejects.toThrow()

    expect(await estadoConexion()).toEqual(limpio)
  })

  it('queda limpia después de una consulta del Director (READ ONLY)', async () => {
    await bd.consultarEnTodasLasUniversidades(
      { ...contexto, rol: 'DIRECTOR' },
      'SELECT id FROM facultad',
    )

    expect(await estadoConexion()).toEqual(limpio)
  })

  it('una consulta del dueño de las tablas después no queda filtrada', async () => {
    await bd.consultarEnUniversidad(
      contexto,
      'SELECT id FROM facultad WHERE universidad_id = $1',
    )
    const [{ universidades }] = await bd.query<{ universidades: number }>(
      'SELECT count(DISTINCT universidad_id)::int AS universidades FROM facultad',
    )
    expect(universidades).toBe(UNIVERSIDADES.length)
  })
})
