import type { UsuarioSesion } from '@cursus/shared'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { DataSource } from 'typeorm'
import { AppModule } from '../../src/app.module.js'
import type { RespuestaLogin } from '../../src/auth/auth.controller.js'
import { configurarApp } from '../../src/config/configurar-app.js'
import { opcionesDataSource } from '../../src/database/data-source.js'
import { ejecutarSeed, UNIVERSIDADES } from '../../src/database/seed.js'

// PER-01: cada usuario edita solo su propio nombre; el Director lo ve en solo
// lectura (ADR 0001).

// Base propia con el seed cargado, que se crea y se borra en cada ejecución.
const BD_TEST = `${process.env.POSTGRES_TEST_DB ?? 'cursus_test'}_perfil`
const PASSWORD = 'contraseña-de-prueba'
const BD_ORIGINAL = process.env.POSTGRES_DB

let admin: DataSource
let bd: DataSource
let app: INestApplication<App>

async function tokenDe(correo: string): Promise<string> {
  const respuesta = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ correo, password: PASSWORD })
    .expect(200)
  return (respuesta.body as RespuestaLogin).accessToken
}

const actualizar = (token: string | null, body: object) => {
  const peticion = request(app.getHttpServer()).patch('/api/perfil')
  return (
    token ? peticion.set('Authorization', `Bearer ${token}`) : peticion
  ).send(body)
}

const yo = async (token: string) =>
  (
    await request(app.getHttpServer())
      .get('/api/auth/yo')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
  ).body as UsuarioSesion

// Nombres de todos los usuarios, para comprobar que nadie más cambió.
const nombres = async () =>
  bd.query<{ correo: string; nombre: string }[]>(
    'SELECT correo, nombre FROM usuario ORDER BY correo',
  )

beforeAll(async () => {
  admin = await new DataSource(opcionesDataSource()).initialize()
  await admin.query(`DROP DATABASE IF EXISTS "${BD_TEST}" WITH (FORCE)`)
  await admin.query(`CREATE DATABASE "${BD_TEST}"`)
  bd = await new DataSource(opcionesDataSource(BD_TEST)).initialize()
  await bd.runMigrations()
  await ejecutarSeed(bd, PASSWORD)

  // La API se conecta a la base de este test.
  process.env.POSTGRES_DB = BD_TEST
  const modulo = await Test.createTestingModule({
    imports: [AppModule],
  }).compile()
  app = modulo.createNestApplication<INestApplication<App>>({ logger: false })
  configurarApp(app, { secretoOrigen: '' })
  await app.init()
})

afterAll(async () => {
  await app?.close()
  process.env.POSTGRES_DB = BD_ORIGINAL
  await bd?.destroy()
  if (admin?.isInitialized) {
    await admin.query(`DROP DATABASE IF EXISTS "${BD_TEST}" WITH (FORCE)`)
    await admin.destroy()
  }
})

describe('PATCH /api/perfil', () => {
  // Los usuarios fijos del seed que no son Director, de las dos universidades.
  const casos = UNIVERSIDADES.flatMap((universidad) =>
    universidad.usuarios
      .filter((usuario) => usuario.rol !== 'DIRECTOR')
      .map((usuario) => ({
        correo: `${usuario.usuario}@${universidad.dominio}`,
        rol: usuario.rol,
        nombre: usuario.nombre,
      })),
  )

  it.each(casos)(
    '$correo ($rol) cambia su nombre y solo el suyo',
    async ({ correo, nombre }) => {
      const token = await tokenDe(correo)
      const antes = await nombres()

      const respuesta = await actualizar(token, {
        nombre: 'Nombre Nuevo',
      }).expect(200)
      expect(respuesta.body).toEqual({ nombre: 'Nombre Nuevo' })

      // /api/auth/yo ya muestra el nombre nuevo; nadie más cambió.
      expect((await yo(token)).nombre).toBe('Nombre Nuevo')
      expect(await nombres()).toEqual(
        antes.map((fila) =>
          fila.correo === correo ? { ...fila, nombre: 'Nombre Nuevo' } : fila,
        ),
      )

      // Deja el seed como estaba para los demás casos.
      await actualizar(token, { nombre }).expect(200)
    },
  )

  it('guarda el nombre sin espacios sobrantes', async () => {
    const token = await tokenDe(`alumno@${UNIVERSIDADES[0].dominio}`)
    const respuesta = await actualizar(token, {
      nombre: '  Camila   Rojas  ',
    }).expect(200)
    expect(respuesta.body).toEqual({ nombre: 'Camila Rojas' })
    await actualizar(token, { nombre: 'Alumno Norte' }).expect(200)
  })

  it('el Director recibe 403 y su nombre no cambia (ADR 0001)', async () => {
    const correo = `director@${UNIVERSIDADES[0].dominio}`
    const token = await tokenDe(correo)
    const antes = await nombres()

    await actualizar(token, { nombre: 'Otro Nombre' }).expect(403)
    expect(await nombres()).toEqual(antes)
  })

  it.each([
    ['un nombre vacío', { nombre: '' }],
    ['un nombre con solo espacios', { nombre: '   ' }],
    ['un nombre de más de 120 caracteres', { nombre: 'a'.repeat(121) }],
    ['un nombre que no es texto', { nombre: 42 }],
    ['sin nombre', {}],
    ['otro campo además del nombre', { nombre: 'Nuevo', correo: 'x@y.cl' }],
    ['un intento de cambiar el rol', { nombre: 'Nuevo', rol: 'DIRECTOR' }],
  ])('responde 400 con %s y no cambia nada', async (_caso, body) => {
    const token = await tokenDe(`profesor@${UNIVERSIDADES[0].dominio}`)
    const antes = await nombres()

    await actualizar(token, body).expect(400)
    expect(await nombres()).toEqual(antes)
  })

  it('responde 401 sin sesión', async () => {
    await actualizar(null, { nombre: 'Nuevo' }).expect(401)
  })
})

describe('GET /api/auth/yo', () => {
  it('incluye el correo del usuario para el perfil', async () => {
    const correo = `ayudante@${UNIVERSIDADES[1].dominio}`
    expect((await yo(await tokenDe(correo))).correo).toBe(correo)
  })
})
