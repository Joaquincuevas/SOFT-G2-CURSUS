import type { Rol, SeccionEspacio } from '@cursus/shared'
import type { INestApplication } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { AppModule } from '../../src/app.module.js'
import { AuthService } from '../../src/auth/auth.service.js'
import { configurarApp } from '../../src/config/configurar-app.js'
import type { ContextoUniversidad } from '../../src/database/base-de-datos.service.js'
import { AccesoSeccionService } from '../../src/espacio/acceso-seccion.service.js'

const jwt = new JwtService({ secret: process.env.JWT_SECRET })
const sesion = (rol: Rol) =>
  `Bearer ${jwt.sign({ sub: '00000000-0000-4000-8000-000000000001', sid: '00000000-0000-4000-8000-000000000003', universidad_id: '00000000-0000-4000-8000-000000000002', rol })}`
const RUTA =
  '/api/espacio/secciones/00000000-0000-4000-8000-000000000010/actividades/00000000-0000-4000-8000-000000000020/mi-entrega'
const VALIDA = { archivoId: '00000000-0000-4000-8000-000000000030' }
let app: INestApplication<App>
beforeAll(async () => {
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(AuthService)
    .useValue({ sesionActiva: () => Promise.resolve(true) })
    .overrideProvider(AccesoSeccionService)
    .useValue({
      verificar: (
        contexto: ContextoUniversidad,
        _usuario: string,
        id: string,
      ): Promise<SeccionEspacio> =>
        Promise.resolve({
          id,
          numero: 1,
          rol: contexto.rol,
          curso: { id: 'c1', codigo: 'ICC101', nombre: 'Programación' },
          periodo: { id: 'p1', anio: 2026, semestre: 2 },
        }),
    })
    .compile()
  app = modulo.createNestApplication<INestApplication<App>>({ logger: false })
  configurarApp(app, { secretoOrigen: '' })
  await app.init()
})
afterAll(async () => {
  await app?.close()
})
it('consulta y entrega exigen sesión', async () => {
  await request(app.getHttpServer()).get(RUTA).expect(401)
  await request(app.getHttpServer()).put(RUTA).send(VALIDA).expect(401)
})
it.each<Rol>(['PROFESOR', 'AYUDANTE', 'ADMINISTRATIVO', 'DIRECTOR'])(
  '%s no consulta ni escribe una entrega propia',
  async (rol) => {
    await request(app.getHttpServer())
      .get(RUTA)
      .set('Authorization', sesion(rol))
      .expect(403)
    await request(app.getHttpServer())
      .put(RUTA)
      .set('Authorization', sesion(rol))
      .send(VALIDA)
      .expect(403)
  },
)
it.each([
  {},
  { archivoId: 'inválido' },
  { ...VALIDA, alumnoId: VALIDA.archivoId },
  { ...VALIDA, entregadaEn: '2026-01-01' },
])('rechaza el cuerpo inválido sin tocar la base (%#)', async (body) => {
  await request(app.getHttpServer())
    .put(RUTA)
    .set('Authorization', sesion('ALUMNO'))
    .send(body)
    .expect(400)
})
it('rechaza un identificador de actividad inválido antes de consultar', async () => {
  await request(app.getHttpServer())
    .get(RUTA.replace('00000000-0000-4000-8000-000000000020', 'invalida'))
    .set('Authorization', sesion('ALUMNO'))
    .expect(400)
})
it.each(['post', 'patch', 'delete'] as const)(
  'no existe la ruta %s de entregas propias',
  async (metodo) => {
    await request(app.getHttpServer())
      [metodo](RUTA)
      .set('Authorization', sesion('ALUMNO'))
      .send(VALIDA)
      .expect(404)
  },
)
