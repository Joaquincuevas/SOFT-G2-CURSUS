import { verify } from 'argon2'
import { DataSource } from 'typeorm'
import { crearSuperadmin } from '../../src/database/crear-superadmin.js'
import { opcionesDataSource } from '../../src/database/data-source.js'
import { ejecutarSeed, UNIVERSIDADES } from '../../src/database/seed.js'

// MT-04: el comando que crea el superadmin de producción (npm run superadmin).

const BD_TEST = `${process.env.POSTGRES_TEST_DB ?? 'cursus_test'}_crear_superadmin`
const PASSWORD = 'contraseña-provisoria'

let admin: DataSource
let bd: DataSource

const datos = (correo: string) => ({
  correo,
  nombre: 'Superadmin',
  password: PASSWORD,
})

beforeAll(async () => {
  admin = await new DataSource(opcionesDataSource()).initialize()
  await admin.query(`DROP DATABASE IF EXISTS "${BD_TEST}" WITH (FORCE)`)
  await admin.query(`CREATE DATABASE "${BD_TEST}"`)
  bd = await new DataSource(opcionesDataSource(BD_TEST)).initialize()
  await bd.runMigrations()
  await ejecutarSeed(bd, 'contraseña-del-seed')
})

afterAll(async () => {
  await bd?.destroy()
  if (admin?.isInitialized) {
    await admin.query(`DROP DATABASE IF EXISTS "${BD_TEST}" WITH (FORCE)`)
    await admin.destroy()
  }
})

const superadmins = () =>
  bd.query<
    {
      id: string
      correo: string
      universidad_id: string | null
      facultad_id: string | null
      credencial_provisoria: boolean
      password_hash: string
    }[]
  >(
    `SELECT id, correo, universidad_id, facultad_id, credencial_provisoria,
            password_hash
       FROM usuario WHERE rol = 'SUPERADMIN' ORDER BY correo`,
  )

describe('crearSuperadmin', () => {
  it('crea un superadmin sin universidad, con una contraseña provisoria', async () => {
    const creado = await crearSuperadmin(bd, datos('  Super@Cursus.Test '))

    const [superadmin] = await superadmins()
    expect(superadmin).toMatchObject({
      id: creado.id,
      correo: 'super@cursus.test',
      universidad_id: null,
      facultad_id: null,
      // Debe cambiarla en su primer ingreso (PER-03).
      credencial_provisoria: true,
    })
    // Solo se guarda el hash.
    expect(superadmin.password_hash).not.toContain(PASSWORD)
    expect(await verify(superadmin.password_hash, PASSWORD)).toBe(true)
  })

  it('rechaza un correo que ya existe, sin distinguir mayúsculas', async () => {
    await expect(
      crearSuperadmin(bd, datos('SUPER@cursus.test')),
    ).rejects.toThrow('Ya existe un usuario con ese correo')
    expect(await superadmins()).toHaveLength(1)
  })

  it('rechaza un correo del dominio de una universidad', async () => {
    await expect(
      crearSuperadmin(bd, datos(`super@${UNIVERSIDADES[0].dominio}`)),
    ).rejects.toThrow('no puede ser del dominio de una universidad')
    expect(await superadmins()).toHaveLength(1)
  })

  it.each([
    ['un correo inválido', { ...datos('no-es-correo') }],
    ['un nombre vacío', { ...datos('otro@cursus.test'), nombre: '  ' }],
    [
      'una contraseña corta',
      { ...datos('otro@cursus.test'), password: '1234' },
    ],
  ])('rechaza %s', async (_caso, invalidos) => {
    await expect(crearSuperadmin(bd, invalidos)).rejects.toThrow()
    expect(await superadmins()).toHaveLength(1)
  })
})
