import type { INestApplication } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { AppModule } from '../../src/app.module.js'
import { AuthService } from '../../src/auth/auth.service.js'
import { configurarApp } from '../../src/config/configurar-app.js'

// GES-24. Tokens firmados como los del backend, con una sesión que se da por
// activa (ver permisos.e2e-spec.ts). PermisosGuard y el ValidationPipe
// responden antes de tocar la base.
const jwt = new JwtService({ secret: process.env.JWT_SECRET })
const sesionDe = (rol: string) =>
  `Bearer ${jwt.sign({
    sub: '00000000-0000-0000-0000-000000000001',
    sid: '00000000-0000-0000-0000-000000000003',
    rol,
    universidad_id: '00000000-0000-0000-0000-000000000002',
  })}`

const UNIVERSIDAD = '00000000-0000-4000-8000-000000000005'
const CUENTA = '00000000-0000-4000-8000-000000000006'
const RUTA = `/api/superadmin/universidades/${UNIVERSIDAD}/cuentas`
const BODY = {
  nombre: 'Cuenta Nueva',
  correo: 'cuenta@norte.cursus.test',
  rol: 'DIRECTOR',
}

describe('cuentas del superadmin (e2e)', () => {
  let app: INestApplication<App>

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthService)
      .useValue({ sesionActiva: () => Promise.resolve({ eleccion: null }) })
      .compile()
    app = modulo.createNestApplication<INestApplication<App>>({ logger: false })
    configurarApp(app, { secretoOrigen: '' })
    await app.init()
  })

  afterAll(async () => {
    await app?.close()
  })

  const servidor = () => request(app.getHttpServer())

  it.each(['DIRECTOR', 'ADMINISTRATIVO', 'PROFESOR', 'AYUDANTE', 'ALUMNO'])(
    '%s recibe 403 en todas las rutas',
    async (rol) => {
      const sesion = sesionDe(rol)
      await servidor().get(RUTA).set('Authorization', sesion).expect(403)
      await servidor()
        .post(RUTA)
        .set('Authorization', sesion)
        .send(BODY)
        .expect(403)
      await servidor()
        .patch(`${RUTA}/${CUENTA}`)
        .set('Authorization', sesion)
        .send(BODY)
        .expect(403)
      await servidor()
        .patch(`${RUTA}/${CUENTA}/archivar`)
        .set('Authorization', sesion)
        .expect(403)
    },
  )

  it('responde 401 sin sesión', async () => {
    await servidor().get(RUTA).expect(401)
    await servidor().post(RUTA).send(BODY).expect(401)
    await servidor().patch(`${RUTA}/${CUENTA}/archivar`).expect(401)
  })

  it.each([
    ['sin nombre', { nombre: '' }],
    ['con un correo inválido', { correo: 'no-es-correo' }],
    ['con rol superadmin', { rol: 'SUPERADMIN' }],
    ['con un rol desconocido', { rol: 'INVITADO' }],
    ['con una facultad que no es uuid', { facultadId: 'abc' }],
    ['con un campo extra', { universidadId: UNIVERSIDAD }],
  ])('responde 400 %s', async (_caso, cambio) => {
    await servidor()
      .post(RUTA)
      .set('Authorization', sesionDe('SUPERADMIN'))
      .send({ ...BODY, ...cambio })
      .expect(400)
  })

  it('responde 400 con ids que no son uuid', async () => {
    const sesion = sesionDe('SUPERADMIN')
    await servidor()
      .get('/api/superadmin/universidades/abc/cuentas')
      .set('Authorization', sesion)
      .expect(400)
    await servidor()
      .patch(`${RUTA}/abc/archivar`)
      .set('Authorization', sesion)
      .expect(400)
  })
})
