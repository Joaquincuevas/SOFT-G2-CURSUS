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

  // Solo el Administrativo crea secciones; el Director solo lee.
  it.each(['ALUMNO', 'PROFESOR', 'AYUDANTE', 'DIRECTOR'])(
    '%s recibe 403 al crear una sección (GES-09)',
    async (rol) => {
      await request(app.getHttpServer())
        .post('/api/cursos/00000000-0000-4000-8000-000000000001/secciones')
        .set('Authorization', sesionDe(rol))
        .expect(403)
    },
  )

  describe('ayudantes (GES-13)', () => {
    const ruta = '/api/secciones/00000000-0000-4000-8000-000000000001/ayudantes'
    it.each(['ALUMNO', 'PROFESOR', 'AYUDANTE', 'DIRECTOR'])(
      '%s no puede consultar opciones ni asignar',
      async (rol) => {
        await request(app.getHttpServer())
          .get(ruta)
          .set('Authorization', sesionDe(rol))
          .expect(403)
        await request(app.getHttpServer())
          .post(ruta)
          .set('Authorization', sesionDe(rol))
          .send({ ayudanteIds: ['00000000-0000-4000-8000-000000000001'] })
          .expect(403)
      },
    )
    it('exige sesión', async () => {
      await request(app.getHttpServer()).get(ruta).expect(401)
      await request(app.getHttpServer())
        .post(ruta)
        .send({ ayudanteIds: [] })
        .expect(401)
    })
    it.each([
      {},
      { ayudanteIds: [] },
      { ayudanteIds: 'abc' },
      { ayudanteIds: ['abc'] },
      {
        ayudanteIds: ['00000000-0000-4000-8000-000000000001'],
        rol: 'DIRECTOR',
      },
      { ayudanteIds: Array(2).fill('00000000-0000-4000-8000-000000000001') },
      {
        ayudanteIds: Array.from(
          { length: 101 },
          (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
        ),
      },
    ])('rechaza un body inválido %j', async (datos) => {
      await request(app.getHttpServer())
        .post(ruta)
        .set('Authorization', sesionDe('ADMINISTRATIVO'))
        .send(datos)
        .expect(400)
    })
    it('valida el uuid de la sección', async () => {
      await request(app.getHttpServer())
        .get('/api/secciones/no-es-uuid/ayudantes')
        .set('Authorization', sesionDe('ADMINISTRATIVO'))
        .expect(400)
    })
  })

  it.each(['ALUMNO', 'PROFESOR', 'AYUDANTE'])(
    '%s recibe 403 en la lista de alumnos de una sección (GES-18)',
    async (rol) => {
      await request(app.getHttpServer())
        .get('/api/secciones/00000000-0000-4000-8000-000000000001/alumnos')
        .set('Authorization', sesionDe(rol))
        .expect(403)
    },
  )

  it.each(['ALUMNO', 'PROFESOR', 'AYUDANTE', 'DIRECTOR'])(
    '%s recibe 403 al quitar a un alumno (GES-19)',
    async (rol) => {
      await request(app.getHttpServer())
        .patch(
          '/api/secciones/00000000-0000-4000-8000-000000000001/alumnos/00000000-0000-4000-8000-000000000002/quitar',
        )
        .set('Authorization', sesionDe(rol))
        .expect(403)
    },
  )

  it.each(['ALUMNO', 'PROFESOR', 'AYUDANTE', 'DIRECTOR'])(
    '%s recibe 403 al crear un profesor o ayudante (GES-21)',
    async (rol) => {
      await request(app.getHttpServer())
        .post('/api/usuarios')
        .set('Authorization', sesionDe(rol))
        .send({ nombre: 'X', correo: 'x@norte.cursus.test', rol: 'PROFESOR' })
        .expect(403)
    },
  )

  describe('agregar un alumno (GES-15)', () => {
    const agregar = (rol: string, datos: object) =>
      request(app.getHttpServer())
        .post('/api/secciones/00000000-0000-4000-8000-000000000001/alumnos')
        .set('Authorization', sesionDe(rol))
        .send(datos)

    it.each(['ALUMNO', 'PROFESOR', 'AYUDANTE', 'DIRECTOR'])(
      '%s recibe 403',
      async (rol) => {
        await agregar(rol, { correo: 'alumno@norte.cursus.test' }).expect(403)
      },
    )

    // El ValidationPipe responde antes de tocar la base.
    it.each([
      ['sin correo', {}],
      ['un correo inválido', { correo: 'no-es-correo' }],
      [
        'un nombre de más de 120 caracteres',
        { correo: 'a@b.cl', nombre: 'x'.repeat(121) },
      ],
      ['un campo no esperado', { correo: 'a@b.cl', rol: 'ADMINISTRATIVO' }],
    ])('responde 400 con %s', async (_caso, datos) => {
      await agregar('ADMINISTRATIVO', datos).expect(400)
    })
  })

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
