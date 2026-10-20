import type { DocenteCreado, UsuarioSesion } from '@cursus/shared'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { DataSource } from 'typeorm'
import { AppModule } from '../../src/app.module.js'
import type { RespuestaLogin } from '../../src/auth/auth.controller.js'
import { configurarApp } from '../../src/config/configurar-app.js'
import { opcionesDataSource } from '../../src/database/data-source.js'
import { ejecutarSeed } from '../../src/database/seed.js'

// PER-03: una cuenta con contraseña provisoria solo puede consultar su sesión
// y cambiarla; después usa la API normalmente. Cada test crea su propia cuenta
// con POST /api/usuarios (GES-21).

// Base propia con el seed cargado, que se crea y se borra en cada ejecución.
const BD_TEST = `${process.env.POSTGRES_TEST_DB ?? 'cursus_test'}_cambio_obligatorio`
const PASSWORD = 'contraseña-de-prueba'
const NUEVA = 'otra-contraseña-segura'
const BD_ORIGINAL = process.env.POSTGRES_DB
const ADMIN_INGENIERIA = 'administrativo.ingenieria@norte.cursus.test'

let admin: DataSource
let bd: DataSource
let app: INestApplication<App>

async function tokenDe(correo: string, password = PASSWORD) {
  const respuesta = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ correo, password })
    .expect(200)
  return (respuesta.body as RespuestaLogin).accessToken
}

// Crea un profesor y devuelve su contraseña provisoria.
async function crearProfesor(correo: string): Promise<string> {
  const token = await tokenDe(ADMIN_INGENIERIA)
  const respuesta = await request(app.getHttpServer())
    .post('/api/usuarios')
    .set('Authorization', `Bearer ${token}`)
    .send({ nombre: 'Profesor Provisorio', correo, rol: 'PROFESOR' })
    .expect(201)
  return (respuesta.body as DocenteCreado).passwordProvisoria
}

const yo = (token: string) =>
  request(app.getHttpServer())
    .get('/api/auth/yo')
    .set('Authorization', `Bearer ${token}`)

const cambiar = (token: string, passwordActual: string) =>
  request(app.getHttpServer())
    .put('/api/auth/password')
    .set('Authorization', `Bearer ${token}`)
    .send({ passwordActual, passwordNueva: NUEVA })

// Rutas con sesión de otros módulos: la raíz de la API y el perfil (PER-01).
// Son funciones porque supertest cierra el servidor de una petición creada al
// terminar otra.
const otrasRutas = (token: string) => [
  () =>
    request(app.getHttpServer())
      .get('/api')
      .set('Authorization', `Bearer ${token}`),
  () =>
    request(app.getHttpServer())
      .patch('/api/perfil')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Otro Nombre' }),
]

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

describe('cambio obligatorio de la contraseña provisoria', () => {
  it('con la provisoria, /api/auth/yo lo indica y el resto de la API responde 403', async () => {
    const correo = 'provisorio.uno@norte.cursus.test'
    const token = await tokenDe(correo, await crearProfesor(correo))

    const sesion = (await yo(token).expect(200)).body as UsuarioSesion
    expect(sesion.debeCambiarPassword).toBe(true)

    for (const peticion of otrasRutas(token)) {
      const respuesta = await peticion().expect(403)
      expect(respuesta.body).toMatchObject({
        message: 'Debes cambiar tu contraseña provisoria antes de continuar',
      })
    }
  })

  it('después del cambio la marca desaparece y la API responde normalmente', async () => {
    const correo = 'provisorio.dos@norte.cursus.test'
    const provisoria = await crearProfesor(correo)
    const token = await tokenDe(correo, provisoria)

    await cambiar(token, provisoria).expect(204)

    // El mismo JWT sirve: la marca se lee de la base en cada petición.
    const sesion = (await yo(token).expect(200)).body as UsuarioSesion
    expect(sesion.debeCambiarPassword).toBe(false)
    for (const peticion of otrasRutas(token)) {
      await peticion().expect(200)
    }
    // Y al volver a entrar, con la nueva.
    const otroToken = await tokenDe(correo, NUEVA)
    await request(app.getHttpServer())
      .get('/api')
      .set('Authorization', `Bearer ${otroToken}`)
      .expect(200)
  })

  it('una contraseña actual incorrecta no quita la marca', async () => {
    const correo = 'provisorio.tres@norte.cursus.test'
    const token = await tokenDe(correo, await crearProfesor(correo))

    await cambiar(token, 'no-es-la-provisoria').expect(400)

    const sesion = (await yo(token).expect(200)).body as UsuarioSesion
    expect(sesion.debeCambiarPassword).toBe(true)
  })

  it('las cuentas del seed no tienen la marca', async () => {
    const token = await tokenDe('profesor@norte.cursus.test')
    const sesion = (await yo(token).expect(200)).body as UsuarioSesion
    expect(sesion.debeCambiarPassword).toBe(false)
  })
})
