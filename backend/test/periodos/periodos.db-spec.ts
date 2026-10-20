import { randomUUID } from 'node:crypto'
import type {
  Periodo,
  Carrera,
  CursoCreado,
  UsuarioSesion,
} from '@cursus/shared'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { DataSource } from 'typeorm'
import { AppModule } from '../../src/app.module.js'
import { configurarApp } from '../../src/config/configurar-app.js'
import { opcionesDataSource } from '../../src/database/data-source.js'
import { ejecutarSeed } from '../../src/database/seed.js'

const BD_TEST = `${process.env.POSTGRES_TEST_DB ?? 'cursus_test'}_periodos`
const BD_ORIGINAL = process.env.POSTGRES_DB
const PASSWORD = 'password-solo-para-pruebas'
const INGENIERIA = 'administrativo.ingenieria@norte.cursus.test'
const ECONOMIA = 'administrativo.economia@norte.cursus.test'
const SALUD = 'administrativo@sur.cursus.test'
let admin: DataSource
let bd: DataSource
let app: INestApplication<App>
const tokens = new Map<string, string>()

async function tokenDe(correo: string) {
  if (tokens.has(correo)) return tokens.get(correo)!
  const respuesta = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ correo, password: PASSWORD })
    .expect(200)
  const { accessToken } = respuesta.body as { accessToken: string }
  tokens.set(correo, accessToken)
  return accessToken
}

async function listar(correo = INGENIERIA) {
  const respuesta = await request(app.getHttpServer())
    .get('/api/periodos')
    .set('Authorization', `Bearer ${await tokenDe(correo)}`)
    .expect(200)
  return respuesta.body as Periodo[]
}

const DATOS = {
  anio: 2027,
  semestre: 1,
  fechaInicio: '2027-03-01',
  fechaTermino: '2027-07-15',
  activo: false,
}
async function crear(datos: object = DATOS, correo = INGENIERIA) {
  const token = await tokenDe(correo)
  return request(app.getHttpServer())
    .post('/api/periodos')
    .set('Authorization', `Bearer ${token}`)
    .send(datos)
}
async function activar(id: string, correo = INGENIERIA) {
  const token = await tokenDe(correo)
  return request(app.getHttpServer())
    .patch(`/api/periodos/${id}/activar`)
    .set('Authorization', `Bearer ${token}`)
}

beforeAll(async () => {
  admin = await new DataSource(opcionesDataSource()).initialize()
  await admin.query(`DROP DATABASE IF EXISTS "${BD_TEST}" WITH (FORCE)`)
  await admin.query(`CREATE DATABASE "${BD_TEST}"`)
  bd = await new DataSource(opcionesDataSource(BD_TEST)).initialize()
  await bd.runMigrations()
  await ejecutarSeed(bd, PASSWORD)
  process.env.POSTGRES_DB = BD_TEST
  const modulo = await Test.createTestingModule({
    imports: [AppModule],
  }).compile()
  app = modulo.createNestApplication<INestApplication<App>>({ logger: false })
  configurarApp(app, { secretoOrigen: '' })
  await app.listen(0, '127.0.0.1')
})

afterAll(async () => {
  await app?.close()
  process.env.POSTGRES_DB = BD_ORIGINAL
  await bd?.destroy()
  if (admin?.isInitialized) {
    await admin.query(`DROP DATABASE IF EXISTS "${BD_TEST}" WITH (FORCE)`)
    await admin.destroy()
  }
})

describe('GES-02: períodos académicos', () => {
  it('lista fechas de calendario y comparte los períodos entre facultades de la misma universidad', async () => {
    const norte = await listar()
    expect(norte).toHaveLength(1)
    expect(norte[0]).toMatchObject({
      anio: 2026,
      semestre: 2,
      activo: true,
    })
    expect(norte[0].fechaInicio).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(norte[0].fechaTermino).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(await listar(ECONOMIA)).toEqual(norte)
    expect((await listar(SALUD)).map((p) => p.id)).not.toContain(norte[0].id)
  })

  it('crea inactivo por defecto, sin cambiar el período activo', async () => {
    const datos = {
      anio: DATOS.anio,
      semestre: DATOS.semestre,
      fechaInicio: DATOS.fechaInicio,
      fechaTermino: DATOS.fechaTermino,
    }
    const respuesta = await crear(datos)
    expect(respuesta.status).toBe(201)
    expect(respuesta.body).toMatchObject(DATOS)
    expect((respuesta.body as Periodo).id).toMatch(/^[0-9a-f-]{36}$/)
    expect((await listar())[0]).toMatchObject({
      anio: 2026,
      semestre: 2,
      activo: true,
    })
  })

  it('rechaza duplicados y permite el mismo año/semestre en otra universidad', async () => {
    expect((await crear(DATOS, ECONOMIA)).status).toBe(409)
    expect((await crear(DATOS, SALUD)).status).toBe(201)
  })

  it.each([
    ['fin igual al inicio', { fechaTermino: DATOS.fechaInicio }],
    ['fin anterior al inicio', { fechaTermino: '2027-02-01' }],
    ['fecha imposible', { fechaInicio: '2027-02-30' }],
    ['fecha con año cero', { fechaInicio: '0000-03-01' }],
    ['fecha con hora', { fechaInicio: '2027-03-01T00:00:00Z' }],
    ['año cero', { anio: 0 }],
    ['año fuera de rango', { anio: 10000 }],
    ['año fraccionario', { anio: 2027.5 }],
    ['año como texto', { anio: '2027' }],
    ['semestre inválido', { semestre: 3 }],
    ['activo como texto', { activo: 'true' }],
    ['activo nulo', { activo: null }],
    ['ámbito enviado por cliente', { universidadId: randomUUID() }],
    ['sin fecha', { fechaInicio: undefined }],
  ])('responde 400: %s', async (_caso, cambio) => {
    expect((await crear({ ...DATOS, ...cambio })).status).toBe(400)
  })

  it('crear activo desactiva el anterior de su universidad y preserva la otra', async () => {
    const sur = await listar(SALUD)
    const respuesta = await crear({ ...DATOS, anio: 2028, activo: true })
    expect(respuesta.status).toBe(201)
    const filas = await listar()
    expect(filas.filter((p) => p.activo)).toEqual([respuesta.body])
    expect(await listar(SALUD)).toEqual(sur)
  })

  it('un duplicado activo revierte la desactivación anterior', async () => {
    const antes = await listar()
    expect((await crear({ ...DATOS, activo: true })).status).toBe(409)
    expect(await listar()).toEqual(antes)
  })

  it('activa uno existente de forma idempotente y actualiza /auth/yo', async () => {
    const existente = (await listar()).find((p) => p.anio === 2027)!
    expect((await activar(existente.id, ECONOMIA)).status).toBe(200)
    expect((await activar(existente.id)).status).toBe(200)
    expect((await listar()).filter((p) => p.activo)).toEqual([
      { ...existente, activo: true },
    ])
    const token = await tokenDe(INGENIERIA)
    const yo = await request(app.getHttpServer())
      .get('/api/auth/yo')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect((yo.body as UsuarioSesion).periodoActivo).toEqual({
      id: existente.id,
      anio: 2027,
      semestre: 1,
    })
  })

  it('no activa períodos ajenos ni inexistentes y no cambia el activo al fallar', async () => {
    const antes = await listar()
    const [ajeno] = await listar(SALUD)
    const respuesta = await activar(ajeno.id)
    expect(respuesta.status).toBe(404)
    const inexistente = await activar(randomUUID())
    expect(inexistente.status).toBe(404)
    expect(inexistente.body).toEqual(respuesta.body)
    expect(await listar()).toEqual(antes)
    expect((await activar('no-es-uuid')).status).toBe(400)
  })

  it('serializa creaciones activas concurrentes sin dejar más de uno activo', async () => {
    const respuestas = await Promise.all(
      [2029, 2030].map((anio) => crear({ ...DATOS, anio, activo: true })),
    )
    expect(respuestas.map((r) => r.status)).toEqual([201, 201])
    const activos = (await listar()).filter((p) => p.activo)
    expect(activos).toHaveLength(1)
    expect([2029, 2030]).toContain(activos[0].anio)
  })

  it('serializa activaciones concurrentes y la carrera contra una creación activa', async () => {
    const filas = await listar()
    const respuestas = await Promise.all([
      activar(filas[0].id),
      activar(filas[1].id),
      crear({ ...DATOS, anio: 2031, activo: true }),
    ])
    expect(respuestas.map((r) => r.status)).toEqual([200, 200, 201])
    expect((await listar()).filter((p) => p.activo)).toHaveLength(1)
  })

  it('resuelve dos creaciones del mismo período con 201/409', async () => {
    const respuestas = await Promise.all([
      crear({ ...DATOS, anio: 2032 }),
      crear({ ...DATOS, anio: 2032 }),
    ])
    expect(respuestas.map((r) => r.status).sort()).toEqual([201, 409])
  })

  it('el formulario de cursos puede usar un período nuevo del listado', async () => {
    const token = await tokenDe(INGENIERIA)
    const res = await crear({ ...DATOS, anio: 2033, activo: true })
    expect(res.status).toBe(201)
    const periodo = (await listar())[0]
    expect(periodo.id).toBe((res.body as Periodo).id)
    const carreras = await request(app.getHttpServer())
      .get('/api/carreras')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    const [carrera] = carreras.body as Carrera[]
    const curso = await request(app.getHttpServer())
      .post('/api/cursos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        codigo: 'GES02-TEST',
        nombre: 'Curso del período nuevo',
        carreraId: carrera.id,
        periodoId: periodo.id,
      })
      .expect(201)
    expect((curso.body as CursoCreado).periodo).toEqual({
      id: periodo.id,
      anio: 2033,
      semestre: 1,
    })
  })

  it.each(['director', 'profesor', 'ayudante', 'alumno'])(
    '%s puede leer, pero no crear ni activar',
    async (usuario) => {
      const correo = `${usuario}@norte.cursus.test`
      const [periodo] = await listar(correo)
      expect((await crear({ ...DATOS, anio: 2040 }, correo)).status).toBe(403)
      expect((await activar(periodo.id, correo)).status).toBe(403)
    },
  )

  it('las tres operaciones exigen sesión', async () => {
    await request(app.getHttpServer()).get('/api/periodos').expect(401)
    await request(app.getHttpServer())
      .post('/api/periodos')
      .send(DATOS)
      .expect(401)
    await request(app.getHttpServer())
      .patch(`/api/periodos/${randomUUID()}/activar`)
      .expect(401)
  })
})
