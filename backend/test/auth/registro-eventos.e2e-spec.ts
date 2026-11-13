import { Logger, type INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { vi } from 'vitest'
import { AppModule } from '../../src/app.module.js'
import { AuthService } from '../../src/auth/auth.service.js'
import { LimiteLogin } from '../../src/auth/limite-login.service.js'
import { configurarApp } from '../../src/config/configurar-app.js'
import { BaseDeDatos } from '../../src/database/base-de-datos.service.js'

// SEG-04 sin PostgreSQL: el controlador registra un evento por cada intento de
// login, con la IP que ya usa el límite de intentos, sin cambiar la respuesta
// y sin que un fallo al registrar la tumbe. Lo que se guarda (y lo que no) se
// prueba contra la base en test/seguridad/eventos.db-spec.ts.
const SECRETO = 'origen-solo-para-tests'
const CORREO = 'persona@norte.cursus.test'
const PASSWORD = 'password-de-prueba'
const USUARIO_ID = '7d3c2b1a-0000-4000-8000-000000000001'
const TOKENS = {
  accessToken: 'jwt-de-prueba',
  refreshToken: 'refresh-de-prueba',
  usuarioId: USUARIO_ID,
}

const intentar = vi.fn()
const query = vi.fn()

async function crearApp(secretoOrigen: string) {
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(LimiteLogin)
    .useValue({ intentar })
    .overrideProvider(AuthService)
    .useValue({
      segundosRefresh: 60,
      sesionActiva: () => Promise.resolve(true),
    })
    .overrideProvider(BaseDeDatos)
    .useValue({ query })
    .compile()
  const app = modulo.createNestApplication<INestApplication<App>>({
    logger: false,
  })
  configurarApp(app, { secretoOrigen })
  await app.init()
  return app
}

let app: INestApplication<App>
let appSinProxy: INestApplication<App>
beforeAll(async () => {
  app = await crearApp(SECRETO)
  appSinProxy = await crearApp('')
})
afterAll(async () => {
  await app?.close()
  await appSinProxy?.close()
})
beforeEach(() => {
  intentar.mockReset()
  query.mockReset().mockResolvedValue([])
})

const login = (ip = '203.0.113.7') =>
  request(app.getHttpServer())
    .post('/api/auth/login')
    .set('x-origin-secret', SECRETO)
    .set('x-vercel-forwarded-for', ip)
    .send({ correo: CORREO, password: PASSWORD })

// Parámetros del único evento registrado: [correo digitado, ip, resultado,
// id de la cuenta que resolvió el login].
const registrado = () => {
  expect(query).toHaveBeenCalledTimes(1)
  expect(query.mock.calls[0][0]).toContain('registrar_inicio_sesion')
  return query.mock.calls[0][1] as [
    string | null,
    string | null,
    string,
    string | null,
  ]
}

describe('POST /api/auth/login registra el intento (SEG-04)', () => {
  it('un inicio exitoso registra EXITOSO con la IP del proxy y responde como antes', async () => {
    intentar.mockResolvedValue({ resultado: TOKENS, retryAfter: 0 })
    const respuesta = await login('198.51.100.20').expect(200)
    expect(respuesta.body).toEqual({ accessToken: 'jwt-de-prueba' })
    expect(respuesta.get('Set-Cookie')?.[0]).toContain('refresh=')
    // Un éxito registra la cuenta que resolvió el login, sin el correo.
    expect(registrado()).toEqual([null, '198.51.100.20', 'EXITOSO', USUARIO_ID])
  })

  it('un fallo registra FALLIDO y responde 401 con el mismo mensaje', async () => {
    intentar.mockResolvedValue({ resultado: null, retryAfter: 0 })
    const respuesta = await login().expect(401)
    expect(respuesta.body).toMatchObject({ message: 'Credenciales inválidas' })
    expect(respuesta.get('Set-Cookie')).toBeUndefined()
    expect(registrado()).toEqual([CORREO, '203.0.113.7', 'FALLIDO', null])
  })

  it('el bloqueo registra BLOQUEADO y responde 429 con Retry-After', async () => {
    intentar.mockResolvedValue({ resultado: null, retryAfter: 120 })
    const respuesta = await login().expect(429)
    expect(respuesta.headers['retry-after']).toBe('120')
    expect(respuesta.body).toMatchObject({ statusCode: 429, retryAfter: 120 })
    expect(registrado()).toEqual([CORREO, '203.0.113.7', 'BLOQUEADO', null])
  })

  it('sin la configuración de proxy ignora la IP que declara el cliente', async () => {
    intentar.mockResolvedValue({ resultado: null, retryAfter: 0 })
    await request(appSinProxy.getHttpServer())
      .post('/api/auth/login')
      .set('x-vercel-forwarded-for', '203.0.113.99')
      .send({ correo: CORREO, password: PASSWORD })
      .expect(401)
    const [, ip] = registrado()
    expect(ip).not.toBe('203.0.113.99')
    expect(ip).toBe('127.0.0.1')
    expect(intentar.mock.calls[0][1]).toBe('127.0.0.1')
  })

  it('un body inválido o una IP inválida no registran nada', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('x-origin-secret', SECRETO)
      .send({ correo: '', password: '' })
      .expect(400)
    await login('no-es-una-ip').expect(400)
    expect(query).not.toHaveBeenCalled()
  })

  it.each([
    ['exitoso', { resultado: TOKENS, retryAfter: 0 }, 200],
    ['fallido', { resultado: null, retryAfter: 0 }, 401],
    ['bloqueado', { resultado: null, retryAfter: 30 }, 429],
  ])(
    'si el registro falla, el login %s responde igual y el log lleva un mensaje fijo sin lo digitado',
    async (caso, limite, estado) => {
      const resultado = {
        exitoso: 'EXITOSO',
        fallido: 'FALLIDO',
        bloqueado: 'BLOQUEADO',
      }[caso]
      intentar.mockResolvedValue(limite)
      // El texto del error viene del driver y puede repetir lo digitado
      // (p. ej. "invalid input syntax for type inet: ..."); TypeORM además
      // adjunta la consulta y sus parámetros.
      query.mockRejectedValue(
        Object.assign(new Error(`valor inválido: ${CORREO} ${PASSWORD}`), {
          code: '22P02',
          query:
            'SELECT public.registrar_inicio_sesion($1, $2::inet, $3, $4::uuid)',
          parameters: [CORREO, PASSWORD],
        }),
      )
      const error = vi
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => {})
      try {
        await login().expect(estado)
        expect(error).toHaveBeenCalledTimes(1)
        const mensaje = String(error.mock.calls[0][0])
        expect(mensaje).toContain('No se pudo registrar el inicio de sesión')
        expect(mensaje).toBe(
          `No se pudo registrar el inicio de sesión ${resultado} (SQLSTATE 22P02)`,
        )
        expect(mensaje).not.toContain(CORREO)
        expect(mensaje).not.toContain(PASSWORD)
      } finally {
        error.mockRestore()
      }
    },
  )
})
