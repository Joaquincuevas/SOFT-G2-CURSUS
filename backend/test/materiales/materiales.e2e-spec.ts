import type { Rol } from '@cursus/shared'
import type { INestApplication } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { AppModule } from '../../src/app.module.js'
import { AuthService } from '../../src/auth/auth.service.js'
import { configurarApp } from '../../src/config/configurar-app.js'

// MAT-04 sin llegar a la base: sesión, permisos CASL y formato del id. Los
// casos que escriben (201, 400 por el archivo, 409) están en
// materiales.db-spec.ts, que usa PostgreSQL.
const jwt = new JwtService({ secret: process.env.JWT_SECRET })
const sesion = (rol: Rol) =>
  `Bearer ${jwt.sign({
    sub: '00000000-0000-4000-8000-000000000001',
    sid: '00000000-0000-4000-8000-000000000003',
    universidad_id: '00000000-0000-4000-8000-000000000002',
    rol,
  })}`
const RUTA =
  '/api/espacio/secciones/00000000-0000-4000-8000-000000000010/materiales'
const VALIDA = {
  archivoId: '00000000-0000-4000-8000-000000000020',
  categoria: 'GUIA',
  titulo: 'Guía 1',
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

describe('materiales de una sección (MAT-04)', () => {
  it('GET y POST responden 401 sin sesión', async () => {
    await request(app.getHttpServer()).get(RUTA).expect(401)
    await request(app.getHttpServer()).post(RUTA).send(VALIDA).expect(401)
  })

  it('responde 400 si el id de la sección no es un UUID', async () => {
    await request(app.getHttpServer())
      .post('/api/espacio/secciones/no-es-uuid/materiales')
      .set('Authorization', sesion('PROFESOR'))
      .send(VALIDA)
      .expect(400)
  })

  // Sin permiso CASL: 403 antes de revisar la sección. Solo el profesor tiene
  // create y read de Material.
  it.each<Rol>(['ADMINISTRATIVO', 'AYUDANTE', 'ALUMNO', 'DIRECTOR'])(
    '%s no tiene permiso CASL para listar ni registrar: 403',
    async (rol) => {
      await request(app.getHttpServer())
        .get(RUTA)
        .set('Authorization', sesion(rol))
        .expect(403)
      await request(app.getHttpServer())
        .post(RUTA)
        .set('Authorization', sesion(rol))
        .send(VALIDA)
        .expect(403)
    },
  )

  it('no hay ruta DELETE ni PATCH', async () => {
    for (const metodo of ['delete', 'patch'] as const) {
      await request(app.getHttpServer())
        [metodo](`${RUTA}/00000000-0000-4000-8000-000000000020`)
        .set('Authorization', sesion('PROFESOR'))
        .expect(404)
    }
  })
})
