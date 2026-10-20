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

// PER-02: el usuario cambia su contraseña, también el Director, y se cierran
// sus demás sesiones. Cada test usa un usuario distinto, porque los intentos
// fallidos cuentan para el límite de la cuenta.

// Base propia con el seed cargado, que se crea y se borra en cada ejecución.
const BD_TEST = `${process.env.POSTGRES_TEST_DB ?? 'cursus_test'}_password`
const PASSWORD = 'contraseña-de-prueba'
const NUEVA = 'otra-contraseña-segura'
const BD_ORIGINAL = process.env.POSTGRES_DB

let admin: DataSource
let bd: DataSource
let app: INestApplication<App>

const login = (correo: string, password = PASSWORD) =>
  request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ correo, password })

// Inicia sesión y devuelve el JWT y la cookie refresh.
async function sesion(correo: string) {
  const respuesta = await login(correo).expect(200)
  const cookie = (respuesta.get('Set-Cookie') ?? []).find((valor) =>
    valor.startsWith('refresh='),
  ) as string
  return {
    token: (respuesta.body as RespuestaLogin).accessToken,
    cookie: cookie.split(';')[0],
  }
}

const cambiar = (token: string | null, body: object) => {
  const peticion = request(app.getHttpServer()).put('/api/auth/password')
  return (
    token ? peticion.set('Authorization', `Bearer ${token}`) : peticion
  ).send(body)
}

const yo = (token: string) =>
  request(app.getHttpServer())
    .get('/api/auth/yo')
    .set('Authorization', `Bearer ${token}`)

const renovar = (cookie: string) =>
  request(app.getHttpServer()).post('/api/auth/refresh').set('Cookie', cookie)

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

describe('PUT /api/auth/password', () => {
  it('cambia la contraseña: la anterior deja de servir y la nueva entra', async () => {
    const correo = 'alumno@norte.cursus.test'
    const { token } = await sesion(correo)

    await cambiar(token, {
      passwordActual: PASSWORD,
      passwordNueva: NUEVA,
    }).expect(204)

    await login(correo).expect(401)
    await login(correo, NUEVA).expect(200)
  })

  it('cierra las demás sesiones y mantiene la actual', async () => {
    const correo = 'profesor@norte.cursus.test'
    const actual = await sesion(correo)
    const otra = await sesion(correo)

    await cambiar(actual.token, {
      passwordActual: PASSWORD,
      passwordNueva: NUEVA,
    }).expect(204)

    await yo(actual.token).expect(200)
    await renovar(actual.cookie).expect(200)
    // Al final: reusar un refresh revocado cierra todas las sesiones.
    await yo(otra.token).expect(401)
    await renovar(otra.cookie).expect(401)
  })

  it('el Director también cambia su contraseña', async () => {
    const correo = 'director@norte.cursus.test'
    const { token } = await sesion(correo)

    await cambiar(token, {
      passwordActual: PASSWORD,
      passwordNueva: NUEVA,
    }).expect(204)

    await login(correo, NUEVA).expect(200)
  })

  it('rechaza una contraseña actual incorrecta sin cambiar nada', async () => {
    const correo = 'ayudante@norte.cursus.test'
    const { token } = await sesion(correo)

    const respuesta = await cambiar(token, {
      passwordActual: 'no-es-la-contraseña',
      passwordNueva: NUEVA,
    }).expect(400)
    expect(respuesta.body).toMatchObject({
      message: 'La contraseña actual no es correcta',
    })

    await login(correo).expect(200)
    await login(correo, NUEVA).expect(401)
  })

  it('rechaza una contraseña nueva igual a la actual', async () => {
    const { token } = await sesion('administrativo.economia@norte.cursus.test')

    const respuesta = await cambiar(token, {
      passwordActual: PASSWORD,
      passwordNueva: PASSWORD,
    }).expect(400)
    expect(respuesta.body).toMatchObject({
      message: 'La contraseña nueva debe ser distinta de la actual',
    })
  })

  it('rechaza una contraseña nueva de menos de 8 caracteres', async () => {
    const correo = 'administrativo.ingenieria@norte.cursus.test'
    const { token } = await sesion(correo)

    const respuesta = await cambiar(token, {
      passwordActual: PASSWORD,
      passwordNueva: 'corta',
    }).expect(400)
    expect(respuesta.body).toMatchObject({
      message: ['La contraseña nueva debe tener al menos 8 caracteres'],
    })

    await login(correo).expect(200)
  })

  it('el quinto intento fallido responde 429 y bloquea también el login', async () => {
    const correo = 'alumno@sur.cursus.test'
    const { token } = await sesion(correo)
    const fallido = {
      passwordActual: 'no-es-la-contraseña',
      passwordNueva: NUEVA,
    }

    for (let i = 0; i < 4; i++) await cambiar(token, fallido).expect(400)
    const quinto = await cambiar(token, fallido).expect(429)
    expect(Number(quinto.headers['retry-after'])).toBeGreaterThan(0)

    // Con el límite alcanzado, ni la contraseña correcta pasa.
    await cambiar(token, {
      passwordActual: PASSWORD,
      passwordNueva: NUEVA,
    }).expect(429)
    await login(correo).expect(429)
  })

  it('responde 401 sin sesión', async () => {
    await cambiar(null, {
      passwordActual: PASSWORD,
      passwordNueva: NUEVA,
    }).expect(401)
  })
})
