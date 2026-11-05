import type { Rol } from '@cursus/shared'
import type { INestApplication } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { AppModule } from '../../src/app.module.js'
import { AuthService } from '../../src/auth/auth.service.js'
import { configurarApp } from '../../src/config/configurar-app.js'

// NOT-10 sin llegar a la base: sesión y rol. La lista del profesor y el 404
// de otra universidad al abrir una pendiente están en
// pendientes-revision.db-spec.ts.
const jwt = new JwtService({ secret: process.env.JWT_SECRET })
const sesion = (rol: Rol) =>
  `Bearer ${jwt.sign({
    sub: '00000000-0000-4000-8000-000000000001',
    sid: '00000000-0000-4000-8000-000000000003',
    universidad_id: '00000000-0000-4000-8000-000000000002',
    rol,
  })}`
const RUTA = '/api/dashboard/pendientes-revision'

let app: INestApplication<App>
beforeAll(async () => {
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(AuthService)
    .useValue({ sesionActiva: () => Promise.resolve(true) })
    .compile()
  app = modulo.createNestApplication<INestApplication<App>>({ logger: false })
  configurarApp(app, { secretoOrigen: '' })
  await app.init()
})
afterAll(async () => {
  await app?.close()
})

describe('GET /api/dashboard/pendientes-revision (NOT-10)', () => {
  it('responde 401 sin sesión', async () => {
    await request(app.getHttpServer()).get(RUTA).expect(401)
  })

  it.each<Rol>(['AYUDANTE', 'ALUMNO', 'ADMINISTRATIVO', 'DIRECTOR'])(
    '%s recibe 403: la lista es solo del profesor',
    async (rol) => {
      await request(app.getHttpServer())
        .get(RUTA)
        .set('Authorization', sesion(rol))
        .expect(403)
    },
  )

  it.each(['post', 'patch', 'delete'] as const)(
    'no hay ruta %s',
    async (metodo) => {
      await request(app.getHttpServer())
        [metodo](RUTA)
        .set('Authorization', sesion('PROFESOR'))
        .expect(404)
    },
  )
})
