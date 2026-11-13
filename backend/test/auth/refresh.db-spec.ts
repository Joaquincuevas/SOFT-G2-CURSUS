import { createHash } from 'node:crypto'
import { hash } from 'argon2'
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
import { CorreoRecuperacion } from '../../src/auth/correo-recuperacion.service.js'
import { RecuperacionService } from '../../src/auth/recuperacion.service.js'
import { vi } from 'vitest'

const enviarRecuperacion = vi.fn<CorreoRecuperacion['enviar']>()

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
  })
    .overrideProvider(CorreoRecuperacion)
    .useValue({ enviar: enviarRecuperacion })
    .compile()
  app = modulo.createNestApplication<INestApplication<App>>({ logger: false })
  configurarApp(app, { secretoOrigen: '' })
  await app.init()
})

it('SEG-03 responde igual, expira y consume el enlace una vez, revocando sesiones', async () => {
  enviarRecuperacion.mockClear()
  const correo = 'recuperacion@sur.cursus.test'
  await bd.query(
    `INSERT INTO usuario (universidad_id, nombre, correo, password_hash, rol)
     SELECT universidad_id, 'Alumno recuperación', $1, password_hash, rol
       FROM usuario WHERE correo = 'alumno@sur.cursus.test'`,
    [correo],
  )
  const anterior = await login(correo)
  enviarRecuperacion.mockResolvedValue(true)
  const solicitar = (direccion: string) =>
    request(app.getHttpServer())
      .post('/api/auth/recuperar-password')
      .send({ correo: direccion })
      .expect(204)
  const [existe, falta] = await Promise.all([
    solicitar(correo),
    solicitar('ausente@sur.cursus.test'),
  ])
  expect(existe.text).toBe(falta.text)
  expect(enviarRecuperacion).toHaveBeenCalledTimes(1)
  await solicitar(correo)
  expect(enviarRecuperacion).toHaveBeenCalledTimes(1)
  const [, vencido] = enviarRecuperacion.mock.calls[0]
  const passwordNueva = 'contraseña-nueva-SEG03'
  const restablecer = (token: string) =>
    request(app.getHttpServer())
      .post('/api/auth/restablecer-password')
      .send({ token, passwordNueva })
  const [vigencia] = await bd.query<{ segundos: number }[]>(
    'SELECT extract(epoch FROM expira_en - clock_timestamp())::float8 AS segundos FROM recuperacion_password WHERE hash = $1',
    [hashDe(vencido)],
  )
  expect(vigencia.segundos).toBeGreaterThan(1790)
  expect(vigencia.segundos).toBeLessThanOrEqual(1800)
  await bd.query(
    'UPDATE recuperacion_password SET expira_en = now() WHERE hash = $1',
    [hashDe(vencido)],
  )
  await restablecer(vencido).expect(400)
  await solicitar(correo)
  const [, valido] = enviarRecuperacion.mock.calls[1]
  expect(valido).not.toBe(vencido)
  const intentos = await Promise.all([restablecer(valido), restablecer(valido)])
  expect(intentos.map((r) => r.status).sort()).toEqual([204, 400])
  await refresh(anterior).expect(401)
  await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ correo, password: passwordNueva })
    .expect(200)
}, 20000)

it('SEG-03 descarta el enlace si falla el envío y el cambio de credencial invalida el siguiente', async () => {
  enviarRecuperacion.mockClear()
  enviarRecuperacion.mockResolvedValueOnce(false).mockResolvedValue(true)
  const correo = 'recuperacion-fallida@sur.cursus.test'
  const [{ id }] = await bd.query<{ id: string }[]>(
    `INSERT INTO usuario (universidad_id, nombre, correo, password_hash, rol)
     SELECT universidad_id, 'Alumno recuperación', $1, password_hash, rol
       FROM usuario WHERE correo = 'alumno@sur.cursus.test' RETURNING id`,
    [correo],
  )
  const recuperacion = app.get(RecuperacionService)
  await recuperacion.solicitar(correo, null)
  expect(enviarRecuperacion).toHaveBeenCalledTimes(1)
  expect(
    await bd.query(
      'SELECT 1 FROM recuperacion_password WHERE usuario_id = $1',
      [id],
    ),
  ).toEqual([])

  await recuperacion.solicitar(correo, null)
  expect(enviarRecuperacion).toHaveBeenCalledTimes(2)
  const [, token] = enviarRecuperacion.mock.calls[1]
  await bd.query(
    'UPDATE usuario SET password_hash = $2 WHERE id = $1',
    [id, await hash('contraseña cambiada')],
  )
  await expect(
    recuperacion.restablecer(token, 'contraseña nueva'),
  ).resolves.toBe(false)
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
  it('invalida todos los JWT de la sesión, incluidos los anteriores a renovar', async () => {
    const original = await login()
    const primera = await refresh(original).expect(200)
    const segunda = await refresh(tokenDe(primera)).expect(200)
    const acceso = (respuesta: request.Response) =>
      request(app.getHttpServer())
        .get('/api/auth/yo')
        .set(
          'Authorization',
          `Bearer ${(respuesta.body as RespuestaLogin).accessToken}`,
        )

    await acceso(primera).expect(200)
    await acceso(segunda).expect(200)
    // Incluso si logout lleva la cookie anterior a una rotación concurrente.
    await logout(tokenDe(primera)).expect(204)
    await acceso(primera).expect(401)
    await acceso(segunda).expect(401)
    await refresh(tokenDe(segunda)).expect(401)
  })

  it('cerrar una sesión no cierra otro navegador del mismo usuario', async () => {
    const primera = await login()
    const otra = await login()
    await logout(primera).expect(204)
    await logout(primera).expect(204)
    await refresh(otra).expect(200)
  })
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
