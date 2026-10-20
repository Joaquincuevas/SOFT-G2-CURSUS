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
const AYUDANTE = '00000000-0000-4000-8000-000000000006'
const BODY = { motivo: 'Asignación equivocada' }

// GES-14: las dos rutas para quitar una asignación.
const RUTAS = [
  [
    'profesor',
    (seccion = SECCION) => `/api/secciones/${seccion}/profesor/quitar`,
  ],
  [
    'ayudante',
    (seccion = SECCION, ayudante = AYUDANTE) =>
      `/api/secciones/${seccion}/ayudantes/${ayudante}/quitar`,
  ],
] as const

describe('quitar asignaciones (e2e)', () => {
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

  describe.each(RUTAS)('quitar %s', (_tipo, ruta) => {
    const quitar = (rol: string, body: object, url = ruta()) =>
      request(app.getHttpServer())
        .patch(url)
        .set('Authorization', sesionDe(rol))
        .send(body)

    it.each(['DIRECTOR', 'ALUMNO', 'PROFESOR', 'AYUDANTE'])(
      '%s recibe 403',
      async (rol) => {
        await quitar(rol, BODY).expect(403)
      },
    )

    it('responde 401 sin sesión', async () => {
      await request(app.getHttpServer()).patch(ruta()).send(BODY).expect(401)
    })

    it('no acepta DELETE: nada se elimina', async () => {
      await request(app.getHttpServer())
        .delete(ruta())
        .set('Authorization', sesionDe('ADMINISTRATIVO'))
        .expect(404)
    })

    it.each([
      ['sin motivo', {}],
      ['con un motivo vacío', { motivo: '' }],
      ['con un motivo de solo espacios', { motivo: '   ' }],
      ['con un motivo que no es texto', { motivo: 42 }],
      ['con un motivo de más de 500 caracteres', { motivo: 'x'.repeat(501) }],
      ['con un campo no esperado', { ...BODY, rol: 'DIRECTOR' }],
    ])('responde 400 %s', async (_caso, body) => {
      await quitar('ADMINISTRATIVO', body).expect(400)
    })

    it('responde 400 con una sección que no es uuid', async () => {
      await quitar('ADMINISTRATIVO', BODY, ruta('no-es-uuid')).expect(400)
    })
  })

  it('responde 400 con un ayudante que no es uuid', async () => {
    await request(app.getHttpServer())
      .patch(`/api/secciones/${SECCION}/ayudantes/no-es-uuid/quitar`)
      .set('Authorization', sesionDe('ADMINISTRATIVO'))
      .send(BODY)
      .expect(400)
  })
})
