import type { INestApplication } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { AppModule } from '../../src/app.module.js'
import { AuthService } from '../../src/auth/auth.service.js'
import { configurarApp } from '../../src/config/configurar-app.js'
const jwt = new JwtService({ secret: process.env.JWT_SECRET })
const sesion = `Bearer ${jwt.sign({ sub: '00000000-0000-4000-8000-000000000001', sid: '00000000-0000-4000-8000-000000000003', rol: 'ADMINISTRATIVO', universidad_id: '00000000-0000-4000-8000-000000000002' })}`
const BASE = '/api/secciones/00000000-0000-4000-8000-000000000010/integrantes'
const ID = '00000000-0000-4000-8000-000000000020'
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
it('exige sesión en las cuatro operaciones', async () => {
  await request(app.getHttpServer()).get(BASE).expect(401)
  await request(app.getHttpServer())
    .get(`${BASE}/buscar?rol=ALUMNO&q=Ana`)
    .expect(401)
  await request(app.getHttpServer())
    .post(BASE)
    .send({ rol: 'ALUMNO', usuarioId: ID })
    .expect(401)
  await request(app.getHttpServer())
    .patch(`${BASE}/${ID}/quitar`)
    .send({ rol: 'ALUMNO', motivo: 'Motivo' })
    .expect(401)
})
it.each([
  '',
  '?rol=DIRECTOR&q=Ana',
  '?rol=ALUMNO&q=a',
  '?rol=ALUMNO&q=aa&extra=1',
])('valida el filtro de búsqueda (%s)', async (filtro) => {
  await request(app.getHttpServer())
    .get(`${BASE}/buscar${filtro}`)
    .set('Authorization', sesion)
    .expect(400)
})
it.each([
  {},
  { rol: 'DIRECTOR', usuarioId: ID },
  { rol: 'ALUMNO', usuarioId: 'invalido' },
  { rol: 'ALUMNO', usuarioId: ID, extra: 'no' },
])('valida el alta (%#)', async (cuerpo) => {
  await request(app.getHttpServer())
    .post(BASE)
    .set('Authorization', sesion)
    .send(cuerpo)
    .expect(400)
})
it.each(['', ' ', 'x'.repeat(501), null])(
  'exige motivo válido para retirar (%#)',
  async (motivo) => {
    await request(app.getHttpServer())
      .patch(`${BASE}/${ID}/quitar`)
      .set('Authorization', sesion)
      .send({ rol: 'ALUMNO', motivo })
      .expect(400)
  },
)
it('valida el UUID de sección antes de leer', async () => {
  await request(app.getHttpServer())
    .get('/api/secciones/invalida/integrantes')
    .set('Authorization', sesion)
    .expect(400)
})
