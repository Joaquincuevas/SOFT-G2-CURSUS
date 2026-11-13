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

// SEG-02 sin PostgreSQL: la forma de los dos pasos del login. La verificación
// del código, el desafío y el límite contra la base están en
// test/seguridad/login-mfa.db-spec.ts.
const USUARIO_ID = '7d3c2b1a-0000-4000-8000-000000000001'
const DESAFIO = 'desafio.firmado.de-prueba'
const CODIGO = '123456'
const TOKENS = {
  accessToken: 'jwt',
  refreshToken: 'refresh',
  usuarioId: USUARIO_ID,
}

const intentar = vi.fn()
const query = vi.fn()
const desafioMfaDe = vi.fn()
const completarMfa = vi.fn()

let app: INestApplication<App>
beforeAll(async () => {
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(LimiteLogin)
    .useValue({ intentar })
    .overrideProvider(AuthService)
    .useValue({
      segundosRefresh: 60,
      sesionActiva: () => Promise.resolve(true),
      desafioMfaDe,
      completarMfa,
    })
    .overrideProvider(BaseDeDatos)
    .useValue({ query })
    .compile()
  app = modulo.createNestApplication<INestApplication<App>>({ logger: false })
  configurarApp(app, { secretoOrigen: '' })
  await app.init()
})
afterAll(() => app?.close())
beforeEach(() => {
  intentar.mockReset()
  completarMfa.mockReset()
  desafioMfaDe
    .mockReset()
    .mockResolvedValue({ usuarioId: USUARIO_ID, ultimoPaso: null })
  query.mockReset().mockResolvedValue([])
})

const paso1 = () =>
  request(app.getHttpServer()).post('/api/auth/login').send({
    correo: 'persona@norte.cursus.test',
    password: 'password-de-prueba',
  })
const paso2 = (cuerpo: object = { desafio: DESAFIO, codigo: CODIGO }) =>
  request(app.getHttpServer()).post('/api/auth/login/mfa').send(cuerpo)

describe('paso 1 con MFA', () => {
  it('entrega el desafío, sin cookie ni sesión, y no registra un acceso', async () => {
    intentar.mockResolvedValue({
      resultado: { usuarioId: USUARIO_ID, desafio: DESAFIO },
      retryAfter: 0,
    })
    const respuesta = await paso1().expect(200)
    expect(respuesta.body).toEqual({ mfaRequerido: true, desafio: DESAFIO })
    expect(respuesta.get('Set-Cookie')).toBeUndefined()
    expect(query).not.toHaveBeenCalled()
  })

  it('la contraseña correcta que espera el código no reinicia el límite', async () => {
    intentar.mockResolvedValue({ resultado: null, retryAfter: 0 })
    await paso1().expect(401)
    const reinicia = intentar.mock.calls[0][3] as (r: object) => boolean
    expect(reinicia({ usuarioId: USUARIO_ID, desafio: DESAFIO })).toBe(false)
    expect(reinicia(TOKENS)).toBe(true)
  })
})

describe('POST /api/auth/login/mfa', () => {
  it('un código válido emite la sesión y registra EXITOSO con subtipo MFA', async () => {
    intentar.mockResolvedValue({ resultado: TOKENS, retryAfter: 0 })
    const respuesta = await paso2().expect(200)
    expect(respuesta.body).toEqual({ accessToken: 'jwt' })
    expect(respuesta.get('Set-Cookie')?.[0]).toContain('refresh=')
    // El límite es por usuario y por IP, y ejecuta la verificación.
    const [cuenta, ip, verificar] = intentar.mock.calls[0] as [
      string,
      string,
      (bd: object) => unknown,
    ]
    expect(cuenta).toBe(`usuario:${USUARIO_ID}`)
    expect(ip).toBe('127.0.0.1')
    await verificar({})
    expect(completarMfa).toHaveBeenCalledWith(
      { usuarioId: USUARIO_ID, ultimoPaso: null },
      CODIGO,
      {},
    )
    expect(query.mock.calls[0][1]).toEqual([
      null,
      '127.0.0.1',
      'EXITOSO',
      USUARIO_ID,
      'MFA',
    ])
  })

  it('un código inválido responde 401 genérico y registra FALLIDO', async () => {
    intentar.mockResolvedValue({ resultado: null, retryAfter: 0 })
    const respuesta = await paso2().expect(401)
    expect(respuesta.body).toMatchObject({
      message: 'Código inválido o expirado',
      code: 'MFA_CODIGO_INVALIDO',
    })
    expect(respuesta.get('Set-Cookie')).toBeUndefined()
    expect(query.mock.calls[0][1]).toEqual([
      null,
      '127.0.0.1',
      'FALLIDO',
      USUARIO_ID,
      'MFA',
    ])
  })

  it('el bloqueo responde 429 con Retry-After y registra BLOQUEADO', async () => {
    intentar.mockResolvedValue({ resultado: null, retryAfter: 90 })
    const respuesta = await paso2().expect(429)
    expect(respuesta.headers['retry-after']).toBe('90')
    expect(JSON.stringify(respuesta.body)).not.toContain(CODIGO)
    expect(query.mock.calls[0][1]).toEqual([
      null,
      '127.0.0.1',
      'BLOQUEADO',
      USUARIO_ID,
      'MFA',
    ])
  })

  it('un desafío inválido responde 401 con su código, sin tocar el límite ni la base', async () => {
    desafioMfaDe.mockResolvedValue(null)
    const respuesta = await paso2().expect(401)
    expect(respuesta.body).toMatchObject({
      message: 'La verificación expiró. Inicia sesión de nuevo.',
      code: 'MFA_DESAFIO_INVALIDO',
    })
    expect(intentar).not.toHaveBeenCalled()
    expect(query).not.toHaveBeenCalled()
  })

  it.each([
    {},
    { desafio: DESAFIO },
    { codigo: CODIGO },
    { desafio: DESAFIO, codigo: '12345' },
    { desafio: DESAFIO, codigo: 'abcdef' },
    { desafio: DESAFIO, codigo: 123456 },
    { desafio: 'x'.repeat(1025), codigo: CODIGO },
    { desafio: DESAFIO, codigo: CODIGO, otro: 1 },
  ])(
    'un body inválido (%j) responde 400 sin consultar nada',
    async (cuerpo) => {
      await paso2(cuerpo).expect(400)
      expect(desafioMfaDe).not.toHaveBeenCalled()
      expect(intentar).not.toHaveBeenCalled()
    },
  )

  it('el código con espacios llega limpio', async () => {
    intentar.mockResolvedValue({ resultado: TOKENS, retryAfter: 0 })
    await paso2({ desafio: DESAFIO, codigo: '123 456' }).expect(200)
    await (intentar.mock.calls[0][2] as (bd: object) => unknown)({})
    expect(completarMfa.mock.calls[0][1]).toBe(CODIGO)
  })

  it('si el registro falla, el log lleva un mensaje fijo sin el código ni el desafío', async () => {
    intentar.mockResolvedValue({ resultado: null, retryAfter: 0 })
    query.mockRejectedValue(
      Object.assign(new Error(`falló con ${CODIGO} y ${DESAFIO}`), {
        code: '22P02',
      }),
    )
    const error = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {})
    try {
      await paso2().expect(401)
      const mensaje = String(error.mock.calls[0][0])
      expect(mensaje).toBe(
        'No se pudo registrar el inicio de sesión FALLIDO (SQLSTATE 22P02)',
      )
    } finally {
      error.mockRestore()
    }
  })
})
