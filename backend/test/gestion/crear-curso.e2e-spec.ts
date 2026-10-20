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

const CURSO = {
  codigo: 'ICC101',
  nombre: 'Programación',
  carreraId: '00000000-0000-4000-8000-000000000003',
  periodoId: '00000000-0000-4000-8000-000000000004',
}

describe('POST /api/cursos (e2e)', () => {
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

  const crear = (rol: string, body: object) =>
    request(app.getHttpServer())
      .post('/api/cursos')
      .set('Authorization', sesionDe(rol))
      .send(body)

  it.each(['DIRECTOR', 'ALUMNO', 'PROFESOR', 'AYUDANTE'])(
    '%s recibe 403',
    async (rol) => {
      await crear(rol, CURSO).expect(403)
    },
  )

  it('responde 401 sin sesión', async () => {
    await request(app.getHttpServer())
      .post('/api/cursos')
      .send(CURSO)
      .expect(401)
  })

  it('responde 400 con un campo no esperado', async () => {
    const respuesta = await crear('ADMINISTRATIVO', {
      ...CURSO,
      universidadId: CURSO.carreraId,
    }).expect(400)
    expect(JSON.stringify(respuesta.body)).toContain(
      'property universidadId should not exist',
    )
  })

  it.each([
    ['sin código', { codigo: undefined }],
    ['con un código de solo espacios', { codigo: '   ' }],
    ['sin nombre', { nombre: '' }],
    ['con una carrera que no es uuid', { carreraId: 'abc' }],
    ['con un período que no es uuid', { periodoId: 123 }],
    ['con un código de más de 20 caracteres', { codigo: 'X'.repeat(21) }],
  ])('responde 400 %s', async (_caso, cambio) => {
    await crear('ADMINISTRATIVO', { ...CURSO, ...cambio }).expect(400)
  })
})
