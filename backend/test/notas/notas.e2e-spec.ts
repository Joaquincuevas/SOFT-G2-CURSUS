import type { Rol } from '@cursus/shared'
import type { INestApplication } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { AppModule } from '../../src/app.module.js'
import { AuthService } from '../../src/auth/auth.service.js'
import { configurarApp } from '../../src/config/configurar-app.js'

// NOT-05 sin llegar a la base: sesión, permisos CASL y formato de los ids.
const jwt = new JwtService({ secret: process.env.JWT_SECRET })
const sesion = (rol: Rol) =>
  `Bearer ${jwt.sign({
    sub: '00000000-0000-4000-8000-000000000001',
    sid: '00000000-0000-4000-8000-000000000003',
    universidad_id: '00000000-0000-4000-8000-000000000002',
    rol,
  })}`
const RUTA =
  '/api/espacio/secciones/00000000-0000-4000-8000-000000000010/evaluaciones/00000000-0000-4000-8000-000000000020/notas'
const NOTAS = {
  notas: [{ alumnoId: '00000000-0000-4000-8000-000000000030', nota: 5.5 }],
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

describe('notas de una evaluación (NOT-05)', () => {
  it('GET y PUT responden 401 sin sesión', async () => {
    await request(app.getHttpServer()).get(RUTA).expect(401)
    await request(app.getHttpServer()).put(RUTA).send(NOTAS).expect(401)
  })

  it.each<Rol>(['ALUMNO', 'ADMINISTRATIVO'])(
    '%s no tiene permiso CASL para leer: 403',
    async (rol) => {
      await request(app.getHttpServer())
        .get(RUTA)
        .set('Authorization', sesion(rol))
        .expect(403)
    },
  )

  it.each<Rol>(['PROFESOR', 'ALUMNO', 'ADMINISTRATIVO', 'DIRECTOR'])(
    '%s no tiene permiso CASL para guardar: 403',
    async (rol) => {
      await request(app.getHttpServer())
        .put(RUTA)
        .set('Authorization', sesion(rol))
        .send(NOTAS)
        .expect(403)
    },
  )

  it.each(['post', 'patch', 'delete'] as const)(
    'no hay ruta %s',
    async (metodo) => {
      await request(app.getHttpServer())
        [metodo](RUTA)
        .set('Authorization', sesion('AYUDANTE'))
        .send(NOTAS)
        .expect(404)
    },
  )
})
