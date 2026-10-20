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
// y el ValidationPipe responden antes de tocar la base.
const jwt = new JwtService({ secret: process.env.JWT_SECRET })
const sesionDe = (rol: string) =>
  `Bearer ${jwt.sign({
    sub: '00000000-0000-0000-0000-000000000001',
    sid: '00000000-0000-0000-0000-000000000003',
    rol,
    universidad_id: '00000000-0000-0000-0000-000000000002',
  })}`

const SECCION = '00000000-0000-4000-8000-000000000005'
const BODY = { profesorId: '00000000-0000-4000-8000-000000000006' }

describe('asignar profesor (e2e)', () => {
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

  const asignar = (rol: string, body: object, seccion = SECCION) =>
    request(app.getHttpServer())
      .put(`/api/secciones/${seccion}/profesor`)
      .set('Authorization', sesionDe(rol))
      .send(body)

  it.each(['DIRECTOR', 'ALUMNO', 'PROFESOR', 'AYUDANTE'])(
    '%s recibe 403 al asignar y al listar profesores',
    async (rol) => {
      await asignar(rol, BODY).expect(403)
      await request(app.getHttpServer())
        .get('/api/profesores')
        .set('Authorization', sesionDe(rol))
        .expect(403)
    },
  )

  it('responde 401 sin sesión', async () => {
    await request(app.getHttpServer())
      .put(`/api/secciones/${SECCION}/profesor`)
      .send(BODY)
      .expect(401)
    await request(app.getHttpServer()).get('/api/profesores').expect(401)
  })

  it.each([
    ['sin profesor', {}],
    ['con un profesor que no es uuid', { profesorId: 'abc' }],
    ['con un campo no esperado', { ...BODY, seccionId: SECCION }],
  ])('responde 400 %s', async (_caso, body) => {
    await asignar('ADMINISTRATIVO', body).expect(400)
  })

  it('responde 400 con una sección que no es uuid', async () => {
    await asignar('ADMINISTRATIVO', BODY, 'no-es-uuid').expect(400)
  })
})
