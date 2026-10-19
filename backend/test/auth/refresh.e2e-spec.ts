import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { AppModule } from '../../src/app.module.js'
import { configurarApp } from '../../src/config/configurar-app.js'

// Sin cookie, refresh y logout responden sin tocar la base. Los casos con
// tokens están en refresh.db-spec.ts.
describe('refresh y logout sin cookie (e2e)', () => {
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

  it('POST /api/auth/refresh es pública y responde 401 sin cookie', () =>
    request(app.getHttpServer()).post('/api/auth/refresh').expect(401))

  it('POST /api/auth/logout es pública y responde 204 sin cookie', () =>
    request(app.getHttpServer()).post('/api/auth/logout').expect(204))

  it('otra cookie no cuenta como refresh token', () =>
    request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', 'refreshx=abc; otra=1')
      .expect(401))

  // Valores que decodeURIComponent no puede decodificar.
  describe.each(['%', '%E0%A4%A'])(
    'con la cookie malformada refresh=%s',
    (valor) => {
      // Set-Cookie que borra la cookie refresh (vacía y ya vencida).
      const borraLaCookie = (respuesta: request.Response) => {
        const cookie = (respuesta.get('Set-Cookie') ?? []).find((c) =>
          c.startsWith('refresh='),
        )
        expect(cookie).toMatch(/^refresh=;/)
        expect(cookie).toContain('Expires=Thu, 01 Jan 1970')
        expect(cookie).toContain('Path=/api/auth')
      }

      it('refresh responde 401 y borra la cookie', async () => {
        const respuesta = await request(app.getHttpServer())
          .post('/api/auth/refresh')
          .set('Cookie', `refresh=${valor}`)
          .expect(401)
        borraLaCookie(respuesta)
      })

      it('logout responde 204 y borra la cookie', async () => {
        const respuesta = await request(app.getHttpServer())
          .post('/api/auth/logout')
          .set('Cookie', `refresh=${valor}`)
          .expect(204)
        borraLaCookie(respuesta)
      })
    },
  )
})
