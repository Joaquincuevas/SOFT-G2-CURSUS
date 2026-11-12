import type { Rol } from '@cursus/shared'
import type { INestApplication } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { AppModule } from '../../src/app.module.js'
import { AuthService } from '../../src/auth/auth.service.js'
import { configurarApp } from '../../src/config/configurar-app.js'

// MAT-08 sin llegar a la base: sesión, permisos CASL y formato del id.
const jwt = new JwtService({ secret: process.env.JWT_SECRET })
const sesion = (rol: Rol) =>
  `Bearer ${jwt.sign({
    sub: '00000000-0000-4000-8000-000000000001',
    sid: '00000000-0000-4000-8000-000000000003',
    universidad_id: '00000000-0000-4000-8000-000000000002',
    rol,
  })}`
const RUTA =
  '/api/espacio/secciones/00000000-0000-4000-8000-000000000010/actividades'
const VALIDA = {
  titulo: 'Informe 1',
  instrucciones: 'Entregar en PDF',
  fecha: '2026-11-15',
  hora: '23:59',
}

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

describe('actividades de una sección (MAT-08)', () => {
  it('GET y POST responden 401 sin sesión', async () => {
    await request(app.getHttpServer()).get(RUTA).expect(401)
    await request(app.getHttpServer()).post(RUTA).send(VALIDA).expect(401)
  })

  it('responde 400 si el id de la sección no es un UUID', async () => {
    await request(app.getHttpServer())
      .get('/api/espacio/secciones/no-es-uuid/actividades')
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

  it('no hay ruta DELETE', async () => {
    await request(app.getHttpServer())
      .delete(RUTA)
      .set('Authorization', sesion('PROFESOR'))
      .expect(404)
  })
})
