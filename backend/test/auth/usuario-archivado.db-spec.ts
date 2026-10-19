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

// Un usuario archivado (archived_at, MT-02) no puede iniciar sesión, renovar
// su sesión ni seguir usando un JWT emitido antes de archivarlo.

// Base propia con el seed cargado, que se crea y se borra en cada ejecución.
const BD_TEST = `${process.env.POSTGRES_TEST_DB ?? 'cursus_test'}_archivado`
const PASSWORD = 'contraseña-de-prueba'
const BD_ORIGINAL = process.env.POSTGRES_DB

let admin: DataSource
let bd: DataSource
let app: INestApplication<App>

const login = (correo: string, password = PASSWORD) =>
  request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ correo, password })

// Valor del refresh token en el Set-Cookie.
function cookieRefresh(respuesta: request.Response): string {
  const cookie = (respuesta.get('Set-Cookie') ?? []).find((c) =>
    c.startsWith('refresh='),
  ) as string
  return cookie.split(';')[0]
}

const archivar = (correo: string, archivado: boolean) =>
  bd.query(
    `UPDATE usuario SET archived_at = ${archivado ? 'now()' : 'NULL'}
      WHERE correo = $1`,
    [correo],
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

describe('usuario archivado', () => {
  it('no puede iniciar sesión y recibe la misma respuesta que un correo inexistente', async () => {
    const correo = 'profesor@sur.cursus.test'
    await archivar(correo, true)
    try {
      const archivado = await login(correo).expect(401)
      const inexistente = await login('nadie@sur.cursus.test').expect(401)
      expect(archivado.body).toEqual(inexistente.body)
    } finally {
      await archivar(correo, false)
    }

    // Al volver a estar vigente, entra de nuevo.
    await login(correo).expect(200)
  })

  it('no puede renovar su sesión ni usar su JWT vigente', async () => {
    const correo = 'ayudante@sur.cursus.test'
    const respuesta = await login(correo).expect(200)
    const { accessToken } = respuesta.body as RespuestaLogin
    const cookie = cookieRefresh(respuesta)

    await archivar(correo, true)
    try {
      await request(app.getHttpServer())
        .get('/api/auth/yo')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(401)
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', cookie)
        .expect(401)
    } finally {
      await archivar(correo, false)
    }

    // El intento de renovar mientras estaba archivado revocó sus sesiones: el
    // JWT no vuelve a servir aunque deje de estar archivado.
    await request(app.getHttpServer())
      .get('/api/auth/yo')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(401)
  })
})
