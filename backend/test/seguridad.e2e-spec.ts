import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { AppModule } from '../src/app.module.js'
import { configurarApp } from '../src/config/configurar-app.js'

// Cabeceras de helmet y validación de bodies (AUTH-08). Ninguno de estos casos
// llega a la base: el login con credenciales válidas se prueba en
// auth/auth.db-spec.ts.
describe('seguridad (e2e)', () => {
  let app: INestApplication<App>

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()
    app = modulo.createNestApplication<INestApplication<App>>({
      logger: false,
    })
    configurarApp(app, { secretoOrigen: '' })
    await app.init()
  })

  afterAll(async () => {
    await app?.close()
  })

  describe.each([
    ['/api/health', 200],
    // Ruta protegida: sin sesión responde 401, también con las cabeceras.
    ['/api/auth/yo', 401],
  ])('cabeceras de helmet en %s', (ruta, estado) => {
    it('trae la CSP estricta y los defaults de helmet', async () => {
      const respuesta = await request(app.getHttpServer())
        .get(ruta)
        .expect(estado)

      expect(respuesta.headers).toMatchObject({
        'content-security-policy': "default-src 'none';frame-ancestors 'none'",
        'x-content-type-options': 'nosniff',
        'x-frame-options': 'SAMEORIGIN',
        'cross-origin-resource-policy': 'same-origin',
        'referrer-policy': 'no-referrer',
      })
      expect(respuesta.headers['strict-transport-security']).toContain(
        'max-age=',
      )
      expect(respuesta.headers['x-powered-by']).toBeUndefined()
    })
  })

  describe('POST /api/auth/login', () => {
    const login = (body: object) =>
      request(app.getHttpServer()).post('/api/auth/login').send(body)

    it('responde 400 con un campo no esperado', async () => {
      const respuesta = await login({
        correo: 'alumno@norte.cursus.test',
        password: 'x',
        rol: 'DIRECTOR',
      }).expect(400)
      expect(JSON.stringify(respuesta.body)).toContain(
        'property rol should not exist',
      )
    })

    it.each([
      ['un body vacío', {}],
      ['un correo que no es texto', { correo: 123, password: 'x' }],
      ['una contraseña vacía', { correo: 'a@b.cl', password: '' }],
      [
        'una contraseña de más de 256 caracteres',
        { correo: 'a@b.cl', password: 'x'.repeat(257) },
      ],
    ])('responde 400 con %s', (_caso, body) => login(body).expect(400))
  })
})
