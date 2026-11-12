import type { INestApplication } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { AppModule } from '../../src/app.module.js'
import { AuthService } from '../../src/auth/auth.service.js'
import { configurarApp } from '../../src/config/configurar-app.js'

// Tokens firmados como los del backend (mismo secreto que vitest.config.e2e.ts),
// con una sesión que se da por activa (ver permisos.e2e-spec.ts). PermisosGuard
// responde antes de tocar la base; lo que necesita la base (ser integrante,
// validar el body) está en anuncios.db-spec.ts.
const jwt = new JwtService({ secret: process.env.JWT_SECRET })
const sesionDe = (rol: string) =>
  `Bearer ${jwt.sign({
    sub: '00000000-0000-0000-0000-000000000001',
    sid: '00000000-0000-0000-0000-000000000003',
    rol,
    universidad_id: '00000000-0000-0000-0000-000000000002',
  })}`

const RUTA =
  '/api/espacio/secciones/00000000-0000-4000-8000-000000000005/anuncios'
const BODY = { titulo: 'Título', cuerpo: 'Cuerpo' }

describe('anuncios (e2e)', () => {
  let app: INestApplication<App>

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AuthService)
      .useValue({ sesionActiva: () => Promise.resolve(true) })
      .compile()
    app = modulo.createNestApplication<INestApplication<App>>({
      logger: false,
    })
    configurarApp(app, { secretoOrigen: '' })
    await app.init()
  })

  afterAll(async () => {
    await app?.close()
  })

  it.each(['ALUMNO', 'AYUDANTE', 'ADMINISTRATIVO', 'DIRECTOR'])(
    '%s recibe 403 al publicar',
    async (rol) => {
      await request(app.getHttpServer())
        .post(RUTA)
        .set('Authorization', sesionDe(rol))
        .send(BODY)
        .expect(403)
    },
  )

  it('el Administrativo recibe 403 al leer', async () => {
    await request(app.getHttpServer())
      .get(RUTA)
      .set('Authorization', sesionDe('ADMINISTRATIVO'))
      .expect(403)
  })

  it('responde 401 sin sesión', async () => {
    await request(app.getHttpServer())
      .patch(`${RUTA}/00000000-0000-4000-8000-000000000006`)
      .send(BODY)
      .expect(401)
    await request(app.getHttpServer())
      .get(`${RUTA}/00000000-0000-4000-8000-000000000006/historial`)
      .expect(401)
    await request(app.getHttpServer()).get(RUTA).expect(401)
    await request(app.getHttpServer()).post(RUTA).send(BODY).expect(401)
    await request(app.getHttpServer())
      .post(`${RUTA}/lecturas`)
      .send({ anuncioIds: [] })
      .expect(401)
  })

  it.each(['ALUMNO', 'AYUDANTE', 'DIRECTOR', 'ADMINISTRATIVO', 'SUPERADMIN'])(
    '%s no accede a edición ni historial',
    async (rol) => {
      const ruta = `${RUTA}/00000000-0000-4000-8000-000000000006`
      await request(app.getHttpServer())
        .patch(ruta)
        .set('Authorization', sesionDe(rol))
        .send(BODY)
        .expect(403)
      await request(app.getHttpServer())
        .get(`${ruta}/historial`)
        .set('Authorization', sesionDe(rol))
        .expect(403)
    },
  )

  it('responde 400 con una sección que no es uuid', async () => {
    await request(app.getHttpServer())
      .get('/api/espacio/secciones/no-es-uuid/anuncios')
      .set('Authorization', sesionDe('ALUMNO'))
      .expect(400)
  })
})
