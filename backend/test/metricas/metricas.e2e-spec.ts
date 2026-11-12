import type { MetricasConsolidadas, Rol } from '@cursus/shared'
import type { INestApplication } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { AppModule } from '../../src/app.module.js'
import { AuthService } from '../../src/auth/auth.service.js'
import { configurarApp } from '../../src/config/configurar-app.js'
import { MetricasService } from '../../src/metricas/metricas.service.js'

// MET-01 sin PostgreSQL: sesión, CASL y la forma de la respuesta. El cálculo
// está en metricas.db-spec.ts.
const jwt = new JwtService({ secret: process.env.JWT_SECRET })
const sesion = (rol: Rol) =>
  `Bearer ${jwt.sign({
    sub: '00000000-0000-4000-8000-000000000001',
    sid: '00000000-0000-4000-8000-000000000003',
    universidad_id: '00000000-0000-4000-8000-000000000002',
    rol,
  })}`
const RUTA = '/api/metricas/consolidado'

const CONSOLIDADO: MetricasConsolidadas = {
  periodos: [{ universidad: 'Norte', anio: 2026, semestre: 2 }],
  aprobacion: { valor: 75, aprobados: 3, evaluados: 4 },
  promedio: { valor: 4.85, alumnos: 4 },
  asistencia: { valor: null, presentes: 0, registros: 0 },
  alumnos: 10,
  cursos: 3,
}

let app: INestApplication<App>
beforeAll(async () => {
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(AuthService)
    .useValue({ sesionActiva: () => Promise.resolve(true) })
    .overrideProvider(MetricasService)
    .useValue({ consolidado: () => Promise.resolve(CONSOLIDADO) })
    .compile()
  app = modulo.createNestApplication<INestApplication<App>>({ logger: false })
  configurarApp(app, { secretoOrigen: '' })
  await app.init()
})
afterAll(async () => {
  await app?.close()
})

describe('GET /api/metricas/consolidado (MET-01)', () => {
  it('responde 401 sin sesión', async () => {
    await request(app.getHttpServer()).get(RUTA).expect(401)
  })

  it('el Director recibe los indicadores: 200', async () => {
    await request(app.getHttpServer())
      .get(RUTA)
      .set('Authorization', sesion('DIRECTOR'))
      .expect(200, CONSOLIDADO)
  })

  it.each<Rol>([
    'ADMINISTRATIVO',
    'PROFESOR',
    'AYUDANTE',
    'ALUMNO',
    'SUPERADMIN',
  ])('%s recibe 403: sin permiso CASL sobre Metricas', async (rol) => {
    await request(app.getHttpServer())
      .get(RUTA)
      .set('Authorization', sesion(rol))
      .expect(403)
  })

  it.each(['post', 'patch', 'delete'] as const)(
    'no hay ruta %s',
    async (metodo) => {
      await request(app.getHttpServer())
        [metodo](RUTA)
        .set('Authorization', sesion('DIRECTOR'))
        .expect(404)
    },
  )
})
