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
    // NOT-15 permite update Nota al profesor para la recorrección. El PUT
    // y el envío lo rechazan por rol de sección en el controlador, después
    // del guard; la pertenencia real y RLS se prueban en los db-spec.
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
    '%s no puede guardar propuestas: 403',
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

// NOT-07: guardar el borrador es el mismo PUT. El 404 de otra universidad
// necesita la base: está en notas.db-spec.ts.
describe('guardar borrador (NOT-07)', () => {
  it('el borrador no se guarda ni se lee sin sesión: 401', async () => {
    await request(app.getHttpServer()).put(RUTA).send(NOTAS).expect(401)
    await request(app.getHttpServer()).get(RUTA).expect(401)
  })

  it.each<Rol>(['PROFESOR', 'ALUMNO', 'ADMINISTRATIVO', 'DIRECTOR'])(
    '%s no guarda un borrador: 403 antes de llegar a la base',
    async (rol) => {
      await request(app.getHttpServer())
        .put(RUTA)
        .set('Authorization', sesion(rol))
        .send(NOTAS)
        .expect(403)
    },
  )

  it.each<Rol>(['ALUMNO', 'ADMINISTRATIVO'])(
    '%s no lee el estado del borrador: 403',
    async (rol) => {
      await request(app.getHttpServer())
        .get(RUTA)
        .set('Authorization', sesion(rol))
        .expect(403)
    },
  )
})

// NOT-08: envío a revisión. El 404 de otra universidad necesita la base: está
// en notas.db-spec.ts.
describe('POST .../notas/envio (NOT-08)', () => {
  const ENVIO = `${RUTA}/envio`

  it('responde 401 sin sesión', async () => {
    await request(app.getHttpServer()).post(ENVIO).expect(401)
  })

  it.each<Rol>(['PROFESOR', 'ALUMNO', 'ADMINISTRATIVO', 'DIRECTOR'])(
    '%s no puede enviar propuestas: 403',
    async (rol) => {
      await request(app.getHttpServer())
        .post(ENVIO)
        .set('Authorization', sesion(rol))
        .expect(403)
    },
  )

  it.each(['get', 'put', 'patch', 'delete'] as const)(
    'no hay ruta %s de envío',
    async (metodo) => {
      await request(app.getHttpServer())
        [metodo](ENVIO)
        .set('Authorization', sesion('AYUDANTE'))
        .expect(404)
    },
  )
})

describe('POST .../notas/:alumnoId/recorreccion (NOT-15)', () => {
  const RECORRECCION = `${RUTA}/00000000-0000-4000-8000-000000000030/recorreccion`
  const datos = {
    notaAnterior: 5.5,
    notaNueva: 6.2,
    motivo: 'Se reconoció el procedimiento',
  }
  it('responde 401 sin sesión', async () => {
    await request(app.getHttpServer())
      .post(RECORRECCION)
      .send(datos)
      .expect(401)
  })
  it.each<Rol>(['AYUDANTE', 'ALUMNO', 'ADMINISTRATIVO', 'DIRECTOR'])(
    '%s no puede recorregir',
    async (rol) => {
      await request(app.getHttpServer())
        .post(RECORRECCION)
        .set('Authorization', sesion(rol))
        .send(datos)
        .expect(403)
    },
  )
  it.each([
    {},
    { ...datos, notaAnterior: undefined },
    { ...datos, notaNueva: 7.1 },
    { ...datos, notaNueva: 5.55 },
    { ...datos, motivo: '' },
    { ...datos, motivo: 'x'.repeat(501) },
    { ...datos, motivo: '\u0000' },
  ])(
    'rechaza el cuerpo inválido antes de llegar a la base (%#)',
    async (cuerpo) => {
      await request(app.getHttpServer())
        .post(RECORRECCION)
        .set('Authorization', sesion('PROFESOR'))
        .send(cuerpo)
        .expect(400)
    },
  )
  it.each([
    `${RUTA}/invalido/recorreccion`,
    RUTA.replace(
      '/evaluaciones/00000000-0000-4000-8000-000000000020/',
      '/evaluaciones/invalida/',
    ) + '/00000000-0000-4000-8000-000000000030/recorreccion',
  ])('rechaza el UUID inválido de %s', async (ruta) => {
    await request(app.getHttpServer())
      .post(ruta)
      .set('Authorization', sesion('PROFESOR'))
      .send(datos)
      .expect(400)
  })
})
