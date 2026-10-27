import type { Rol } from '@cursus/shared'
import type { INestApplication } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { AppModule } from '../../src/app.module.js'
import { AuthService } from '../../src/auth/auth.service.js'
import { configurarApp } from '../../src/config/configurar-app.js'

// ASI-01 sin llegar a la base: sesión, permisos CASL y formato del id.
const jwt = new JwtService({ secret: process.env.JWT_SECRET })
const sesion = (rol: Rol) =>
  `Bearer ${jwt.sign({
    sub: '00000000-0000-4000-8000-000000000001',
    sid: '00000000-0000-4000-8000-000000000003',
    universidad_id: '00000000-0000-4000-8000-000000000002',
    rol,
  })}`
const RUTA =
  '/api/espacio/secciones/00000000-0000-4000-8000-000000000010/clases'
const VALIDA = { fecha: '2026-09-14', inicio: '08:30' }

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

describe('clases de una sección (ASI-01)', () => {
  it('GET y POST responden 401 sin sesión', async () => {
    await request(app.getHttpServer()).get(RUTA).expect(401)
    await request(app.getHttpServer()).post(RUTA).send(VALIDA).expect(401)
  })

  it('responde 400 si el id de la sección no es un UUID', async () => {
    await request(app.getHttpServer())
      .get('/api/espacio/secciones/no-es-uuid/clases')
      .set('Authorization', sesion('PROFESOR'))
      .expect(400)
  })

  it('el Administrativo no tiene permiso CASL para leer ni crear: 403', async () => {
    await request(app.getHttpServer())
      .get(RUTA)
      .set('Authorization', sesion('ADMINISTRATIVO'))
      .expect(403)
    await request(app.getHttpServer())
      .post(RUTA)
      .set('Authorization', sesion('ADMINISTRATIVO'))
      .send(VALIDA)
      .expect(403)
  })

  it.each<Rol>(['AYUDANTE', 'ALUMNO', 'DIRECTOR'])(
    '%s no tiene permiso CASL para crear: 403',
    async (rol) => {
      await request(app.getHttpServer())
        .post(RUTA)
        .set('Authorization', sesion(rol))
        .send(VALIDA)
        .expect(403)
    },
  )

  it('el alumno no tiene permiso CASL para leer las clases (ASI-06 le da su asistencia): 403', async () => {
    await request(app.getHttpServer())
      .get(RUTA)
      .set('Authorization', sesion('ALUMNO'))
      .expect(403)
  })

  it('no hay ruta DELETE', async () => {
    await request(app.getHttpServer())
      .delete(RUTA)
      .set('Authorization', sesion('PROFESOR'))
      .expect(404)
  })
})

describe('asistencia de una clase sin llegar a la base (ASI-02)', () => {
  const ASISTENCIA = `${RUTA}/00000000-0000-4000-8000-000000000020/asistencia`
  const MARCAS = {
    marcas: [
      { alumnoId: '00000000-0000-4000-8000-000000000030', presente: true },
    ],
  }

  it('GET y POST responden 401 sin sesión', async () => {
    await request(app.getHttpServer()).get(ASISTENCIA).expect(401)
    await request(app.getHttpServer()).post(ASISTENCIA).send(MARCAS).expect(401)
  })

  it.each<Rol>(['ALUMNO', 'ADMINISTRATIVO'])(
    '%s no tiene permiso CASL para leer: 403',
    async (rol) => {
      await request(app.getHttpServer())
        .get(ASISTENCIA)
        .set('Authorization', sesion(rol))
        .expect(403)
    },
  )

  it.each<Rol>(['AYUDANTE', 'ALUMNO', 'ADMINISTRATIVO', 'DIRECTOR'])(
    '%s no tiene permiso CASL para guardar: 403',
    async (rol) => {
      await request(app.getHttpServer())
        .post(ASISTENCIA)
        .set('Authorization', sesion(rol))
        .send(MARCAS)
        .expect(403)
    },
  )

  it.each(['put', 'patch', 'delete'] as const)(
    'no hay ruta %s (corregir marcas es ASI-04)',
    async (metodo) => {
      await request(app.getHttpServer())
        [metodo](ASISTENCIA)
        .set('Authorization', sesion('PROFESOR'))
        .send(MARCAS)
        .expect(404)
    },
  )
})
