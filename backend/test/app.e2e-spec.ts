import { INestApplication } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test, TestingModule } from '@nestjs/testing'
import request from 'supertest'
import { App } from 'supertest/types.js'
import { AppModule } from './../src/app.module.js'
import { configurarApp } from './../src/config/configurar-app.js'
import { AuthService } from './../src/auth/auth.service.js'

// Tokens firmados como los del backend (mismo secreto que vitest.config.e2e.ts).
const jwt = new JwtService({ secret: process.env.JWT_SECRET })
const payload = {
  sid: '00000000-0000-0000-0000-000000000003',
  sub: '00000000-0000-0000-0000-000000000001',
  rol: 'ALUMNO',
  universidad_id: '00000000-0000-0000-0000-000000000002',
}

describe('rutas protegidas (e2e)', () => {
  let app: INestApplication<App>

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AuthService)
      .useValue({ sesionActiva: () => Promise.resolve(true) })
      .compile()

    app = moduleFixture.createNestApplication()
    configurarApp(app, { secretoOrigen: '' })
    await app.init()
  })

  afterEach(async () => {
    await app.close()
  })

  const getApi = () => request(app.getHttpServer()).get('/api')

  it('responde 401 sin token', () => {
    return getApi().expect(401)
  })

  it('responde 401 con un token mal formado', () => {
    return getApi().set('Authorization', 'Bearer no-es-un-jwt').expect(401)
  })

  it('responde 401 con un JWT anterior sin identificador de sesión', () => {
    const anterior = jwt.sign({
      sub: payload.sub,
      rol: payload.rol,
      universidad_id: payload.universidad_id,
    })
    return getApi().set('Authorization', `Bearer ${anterior}`).expect(401)
  })

  it('responde 401 con un token firmado con otro secreto', () => {
    const ajeno = new JwtService({ secret: 'y'.repeat(32) }).sign(payload)
    return getApi().set('Authorization', `Bearer ${ajeno}`).expect(401)
  })

  it('responde 401 con un token vencido', () => {
    const vencido = jwt.sign({
      ...payload,
      exp: Math.floor(Date.now() / 1000) - 60,
    })
    return getApi().set('Authorization', `Bearer ${vencido}`).expect(401)
  })

  it('responde 200 con un token válido', () => {
    return getApi()
      .set('Authorization', `Bearer ${jwt.sign(payload)}`)
      .expect(200)
      .expect('Hello World!')
  })

  it('/api/health no exige sesión', () => {
    return request(app.getHttpServer())
      .get('/api/health')
      .expect(200, { status: 'ok' })
  })
})
