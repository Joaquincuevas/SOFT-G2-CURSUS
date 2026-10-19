import type { INestApplication } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { AppModule } from '../app.module.js'
import { HEADER_SECRETO, configurarApp } from './configurar-app.js'
import { AuthService } from '../auth/auth.service.js'

const SECRETO = 'secreto-de-prueba'
// GET /api exige sesión (JwtAuthGuard): estos tests prueban el header secreto,
// así que las peticiones que deben pasar llevan un JWT válido.
const SESION = `Bearer ${new JwtService({
  secret: process.env.JWT_SECRET,
}).sign({
  sid: 'sesion',
  sub: 'usuario',
  rol: 'ALUMNO',
  universidad_id: 'universidad',
})}`

async function crearApp(secretoOrigen: string): Promise<INestApplication<App>> {
  const modulo = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(AuthService)
    .useValue({ sesionActiva: () => Promise.resolve(true) })
    .compile()
  const app = modulo.createNestApplication<INestApplication<App>>({
    logger: false,
  })
  configurarApp(app, { secretoOrigen })
  await app.init()
  return app
}

describe('configurarApp', () => {
  describe('con ORIGIN_SECRET', () => {
    let app: INestApplication<App>

    beforeAll(async () => {
      app = await crearApp(SECRETO)
    })

    afterAll(async () => {
      await app.close()
    })

    it('atiende las rutas bajo /api', async () => {
      await request(app.getHttpServer())
        .get('/api')
        .set(HEADER_SECRETO, SECRETO)
        .set('Authorization', SESION)
        .expect(200, 'Hello World!')
      await request(app.getHttpServer())
        .get('/health')
        .set(HEADER_SECRETO, SECRETO)
        .expect(404)
    })

    it('rechaza con 403 una petición sin el header secreto', async () => {
      await request(app.getHttpServer())
        .get('/api')
        .expect(403, { statusCode: 403, message: 'Forbidden' })
    })

    it('rechaza con 403 un header secreto incorrecto', async () => {
      await request(app.getHttpServer())
        .get('/api')
        .set(HEADER_SECRETO, 'otro-valor')
        .expect(403)
    })

    it('no exige el header secreto en /api/health', async () => {
      await request(app.getHttpServer())
        .get('/api/health')
        .expect(200, { status: 'ok' })
    })

    it('exige el header secreto en /api/health/db', async () => {
      await request(app.getHttpServer()).get('/api/health/db').expect(403)
    })

    it('responde con Cache-Control: no-store', async () => {
      const respuesta = await request(app.getHttpServer())
        .get('/api')
        .set(HEADER_SECRETO, SECRETO)
        .set('Authorization', SESION)
      expect(respuesta.headers['cache-control']).toBe('no-store')

      const rechazo = await request(app.getHttpServer()).get('/api')
      expect(rechazo.headers['cache-control']).toBe('no-store')
    })
  })

  it('no exige el header secreto si ORIGIN_SECRET no está definido', async () => {
    const app = await crearApp('')
    try {
      await request(app.getHttpServer())
        .get('/api')
        .set('Authorization', SESION)
        .expect(200)
    } finally {
      await app.close()
    }
  })
})
