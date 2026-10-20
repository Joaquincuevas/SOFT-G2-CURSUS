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
// responde antes de tocar la base.
const jwt = new JwtService({ secret: process.env.JWT_SECRET })
const sesionDe = (rol: string) =>
  `Bearer ${jwt.sign({
    sub: '00000000-0000-0000-0000-000000000001',
    sid: '00000000-0000-0000-0000-000000000003',
    rol,
    universidad_id: '00000000-0000-0000-0000-000000000002',
  })}`

describe('GET /api/cursos (e2e)', () => {
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

  // Alumno, Profesor y Ayudante ven sus cursos en Mis Cursos, no aquí.
  it.each(['ALUMNO', 'PROFESOR', 'AYUDANTE'])('%s recibe 403', async (rol) => {
    await request(app.getHttpServer())
      .get('/api/cursos')
      .set('Authorization', sesionDe(rol))
      .expect(403)
  })

  it.each(['ALUMNO', 'PROFESOR', 'AYUDANTE'])(
    '%s recibe 403 en el detalle de un curso (GES-08)',
    async (rol) => {
      await request(app.getHttpServer())
        .get('/api/cursos/00000000-0000-4000-8000-000000000001')
        .set('Authorization', sesionDe(rol))
        .expect(403)
    },
  )

  describe('filtros (GES-04)', () => {
    // El ValidationPipe responde antes de tocar la base.
    const listar = (query: Record<string, string>) =>
      request(app.getHttpServer())
        .get('/api/cursos')
        .query(query)
        .set('Authorization', sesionDe('ADMINISTRATIVO'))

    it.each([
      ['una carrera que no es uuid', { carreraId: 'abc' }],
      ['un período que no es uuid', { periodoId: '123' }],
      ['una carrera vacía', { carreraId: '' }],
    ])('responde 400 con %s', async (_caso, query) => {
      await listar(query).expect(400)
    })

    it('responde 400 con un filtro no esperado', async () => {
      const respuesta = await listar({ facultadId: 'x' }).expect(400)
      expect(JSON.stringify(respuesta.body)).toContain(
        'property facultadId should not exist',
      )
    })
  })

  it('responde 401 sin sesión', async () => {
    await request(app.getHttpServer()).get('/api/cursos').expect(401)
  })
})
