import type { INestApplication } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { AppModule } from '../../src/app.module.js'
import { AuthService } from '../../src/auth/auth.service.js'
import { configurarApp } from '../../src/config/configurar-app.js'

const jwt = new JwtService({ secret: process.env.JWT_SECRET })
const sesion = (rol = 'ADMINISTRATIVO') =>
  `Bearer ${jwt.sign({
    sub: '00000000-0000-4000-8000-000000000001',
    sid: '00000000-0000-4000-8000-000000000003',
    universidad_id: '00000000-0000-4000-8000-000000000002',
    rol,
  })}`
const RUTA = '/api/secciones/00000000-0000-4000-8000-000000000001/horario'
const BLOQUE = { dia: 1, inicio: '08:30', termino: '09:20', sala: 'Sala 201' }
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

describe('GES-10: permisos y validación del horario', () => {
  it.each(['ALUMNO', 'PROFESOR', 'AYUDANTE', 'DIRECTOR'])(
    '%s no puede abrir el editor ni guardar',
    async (rol) => {
      await request(app.getHttpServer())
        .get(RUTA)
        .set('Authorization', sesion(rol))
        .expect(403)
      await request(app.getHttpServer())
        .put(RUTA)
        .set('Authorization', sesion(rol))
        .send({ version: 0, bloques: [] })
        .expect(403)
    },
  )
  it('exige sesión', async () => {
    await request(app.getHttpServer()).get(RUTA).expect(401)
    await request(app.getHttpServer())
      .put(RUTA)
      .send({ version: 0, bloques: [] })
      .expect(401)
  })
  it.each([
    {},
    { version: 0 },
    { version: 0, bloques: null },
    { version: 0, bloques: [null] },
    { version: -1, bloques: [] },
    { version: '0', bloques: [] },
    { version: 0.5, bloques: [] },
    { version: 0, bloques: [], universidadId: 'otra' },
    { version: 0, bloques: [1] },
    ...[
      { dia: 0 },
      { dia: 8 },
      { dia: '1' },
      { inicio: '24:00' },
      { inicio: '8:30' },
      { termino: '09:60' },
      { sala: '  ' },
      { sala: 1 },
      { sala: 'a'.repeat(101) },
      { id: 'otro' },
    ].map((cambio) => ({ version: 0, bloques: [{ ...BLOQUE, ...cambio }] })),
    { version: 0, bloques: Array.from({ length: 101 }, () => BLOQUE) },
  ])(
    'rechaza el body inválido %j antes de consultar la base',
    async (cuerpo) => {
      await request(app.getHttpServer())
        .put(RUTA)
        .set('Authorization', sesion())
        .send(cuerpo)
        .expect(400)
    },
  )
  it('valida el identificador de la sección', async () => {
    await request(app.getHttpServer())
      .get('/api/secciones/no-es-uuid/horario')
      .set('Authorization', sesion())
      .expect(400)
  })
})
