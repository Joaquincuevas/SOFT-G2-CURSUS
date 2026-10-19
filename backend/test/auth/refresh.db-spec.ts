import { createHash } from 'node:crypto'
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

// Base propia con el seed cargado, que se crea y se borra en cada ejecución.
const BD_TEST = `${process.env.POSTGRES_TEST_DB ?? 'cursus_test'}_refresh`
const PASSWORD = 'contraseña-de-prueba'
const BD_ORIGINAL = process.env.POSTGRES_DB
const SIETE_DIAS = 7 * 24 * 60 * 60

let admin: DataSource
let bd: DataSource
let app: INestApplication<App>

// Set-Cookie de la cookie refresh, o undefined si la respuesta no la trae.
function cookieRefresh(respuesta: request.Response): string | undefined {
  const cookies = respuesta.get('Set-Cookie') ?? []
  return cookies.find((cookie) => cookie.startsWith('refresh='))
}

// Valor del refresh token en el Set-Cookie.
function tokenDe(respuesta: request.Response): string {
  const cookie = cookieRefresh(respuesta) as string
  return decodeURIComponent(cookie.split(';')[0].slice('refresh='.length))
}

const hashDe = (token: string) =>
  createHash('sha256').update(token).digest('hex')

// Inicia sesión y devuelve el refresh token de la cookie.
async function login(correo = 'alumno@norte.cursus.test') {
  const respuesta = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ correo, password: PASSWORD })
    .expect(200)
  return tokenDe(respuesta)
}

const refresh = (token?: string) => {
  const peticion = request(app.getHttpServer()).post('/api/auth/refresh')
  return token ? peticion.set('Cookie', `refresh=${token}`) : peticion
}

const logout = (token?: string) => {
  const peticion = request(app.getHttpServer()).post('/api/auth/logout')
  return token ? peticion.set('Cookie', `refresh=${token}`) : peticion
}

async function revocado(token: string): Promise<boolean> {
  const [fila] = await bd.query<{ revocado_en: Date | null }[]>(
    'SELECT revocado_en FROM refresh_token WHERE hash = $1',
    [hashDe(token)],
  )
  return fila.revocado_en !== null
}

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

describe('POST /api/auth/login', () => {
  it('setea la cookie refresh HttpOnly, SameSite=Strict y con Path /api/auth', async () => {
    const respuesta = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ correo: 'alumno@norte.cursus.test', password: PASSWORD })
      .expect(200)

    const cookie = cookieRefresh(respuesta)
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Strict')
    expect(cookie).toContain('Path=/api/auth')
    expect(cookie).toContain(`Max-Age=${SIETE_DIAS}`)
    // Secure solo con NODE_ENV=production (imagen Docker).
    expect(cookie).not.toContain('Secure')
  })

  it('guarda solo el hash del refresh token', async () => {
    const token = await login()
    expect(token.length).toBeGreaterThanOrEqual(43)
    const filas = await bd.query<{ hash: string }[]>(
      'SELECT hash FROM refresh_token WHERE hash IN ($1, $2)',
      [token, hashDe(token)],
    )
    expect(filas).toEqual([{ hash: hashDe(token) }])
  })

  it('no setea la cookie si las credenciales no son válidas', async () => {
    const respuesta = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ correo: 'alumno@norte.cursus.test', password: 'otra' })
      .expect(401)
    expect(cookieRefresh(respuesta)).toBeUndefined()
  })
})

describe('POST /api/auth/refresh', () => {
  it('rota el token y entrega un JWT que sirve', async () => {
    const anterior = await login()
    const respuesta = await refresh(anterior).expect(200)
    const nuevo = tokenDe(respuesta)

    expect(nuevo).not.toBe(anterior)
    expect(await revocado(anterior)).toBe(true)
    expect(await revocado(nuevo)).toBe(false)
    await request(app.getHttpServer())
      .get('/api/auth/yo')
      .set(
        'Authorization',
        `Bearer ${(respuesta.body as RespuestaLogin).accessToken}`,
      )
      .expect(200)
  })

  it('responde 401 sin cookie', async () => {
    await refresh().expect(401)
  })

  it('responde 401 y borra la cookie con un token que no existe', async () => {
    const respuesta = await refresh('no-existe').expect(401)
    expect(cookieRefresh(respuesta)).toMatch(
      /^refresh=;.*Expires=Thu, 01 Jan 1970/,
    )
  })

  it('responde 401 con un token revocado por logout', async () => {
    const token = await login()
    await logout(token).expect(204)
    await refresh(token).expect(401)
  })

  it('responde 401 con un token expirado', async () => {
    const token = await login()
    await bd.query(
      "UPDATE refresh_token SET expira_en = now() - interval '1 second' WHERE hash = $1",
      [hashDe(token)],
    )
    await refresh(token).expect(401)
  })

  it('reusar un token ya rotado revoca todas las sesiones del usuario', async () => {
    const correo = 'profesor@norte.cursus.test'
    const otraSesion = await login(correo)
    const robado = await login(correo)
    const vigente = tokenDe(await refresh(robado).expect(200))

    await refresh(robado).expect(401)

    await refresh(vigente).expect(401)
    await refresh(otraSesion).expect(401)
    const [{ activos }] = await bd.query<{ activos: string }[]>(
      `SELECT count(*) AS activos FROM refresh_token rt
       JOIN usuario u ON u.id = rt.usuario_id
       WHERE u.correo = $1 AND rt.revocado_en IS NULL`,
      [correo],
    )
    expect(Number(activos)).toBe(0)
  })

  it('el reuso no toca las sesiones de otros usuarios', async () => {
    const ajeno = await login('ayudante@norte.cursus.test')
    const robado = await login('alumno@sur.cursus.test')
    await refresh(robado).expect(200)
    await refresh(robado).expect(401)
    await refresh(ajeno).expect(200)
  })
})

describe('POST /api/auth/logout', () => {
  it('revoca el token, borra la cookie y responde 204', async () => {
    const token = await login()
    const respuesta = await logout(token).expect(204)
    expect(await revocado(token)).toBe(true)
    expect(cookieRefresh(respuesta)).toMatch(/^refresh=;/)
  })

  it('responde 204 sin cookie o con un token que no existe', async () => {
    await logout().expect(204)
    await logout('no-existe').expect(204)
  })
})
