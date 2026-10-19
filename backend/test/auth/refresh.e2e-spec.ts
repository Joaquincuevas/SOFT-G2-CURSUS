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
})
