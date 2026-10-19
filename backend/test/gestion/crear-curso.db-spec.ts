import type { CursoCreado, Carrera, OpcionPeriodo } from '@cursus/shared'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { DataSource } from 'typeorm'
import { AppModule } from '../../src/app.module.js'
import type { RespuestaLogin } from '../../src/auth/auth.controller.js'
import { configurarApp } from '../../src/config/configurar-app.js'
import { opcionesDataSource } from '../../src/database/data-source.js'
import { ejecutarSeed } from '../../src/database/seed.js'

// Base propia con el seed cargado, que se crea y se borra en cada ejecución.
const BD_TEST = `${process.env.POSTGRES_TEST_DB ?? 'cursus_test'}_gestion`
const PASSWORD = 'contraseña-de-prueba'
const BD_ORIGINAL = process.env.POSTGRES_DB

// Usuarios del seed.
const ADMIN_INGENIERIA = 'administrativo.ingenieria@norte.cursus.test'
const ADMIN_ECONOMIA = 'administrativo.economia@norte.cursus.test'
const ADMIN_SUR = 'administrativo@sur.cursus.test'
const DIRECTOR = 'director@norte.cursus.test'

let admin: DataSource
let bd: DataSource
let app: INestApplication<App>
const tokens = new Map<string, string>()

async function tokenDe(correo: string): Promise<string> {
  if (!tokens.has(correo)) {
    const respuesta = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ correo, password: PASSWORD })
      .expect(200)
    tokens.set(correo, (respuesta.body as RespuestaLogin).accessToken)
  }
  return tokens.get(correo) as string
}

// El token se pide antes de crear la petición: si no, supertest cierra el
// servidor de una petición al terminar la otra.
async function get<T>(correo: string, ruta: string): Promise<T> {
  const token = await tokenDe(correo)
  const respuesta = await request(app.getHttpServer())
    .get(ruta)
    .set('Authorization', `Bearer ${token}`)
    .expect(200)
  return respuesta.body as T
}

// POST /api/cursos; falla si la respuesta no tiene el estado esperado.
async function crear(correo: string, body: object, estado: number) {
  const token = await tokenDe(correo)
  const respuesta = await request(app.getHttpServer())
    .post('/api/cursos')
    .set('Authorization', `Bearer ${token}`)
    .send(body)
    .expect(estado)
  return respuesta.body as CursoCreado & { message: string }
}

// Carrera y período activo que el usuario ve en las listas del formulario.
async function opcionesDe(correo: string) {
  const [carrera] = await get<Carrera[]>(correo, '/api/carreras')
  const [periodo] = await get<OpcionPeriodo[]>(correo, '/api/periodos')
  return { carreraId: carrera.id, periodoId: periodo.id }
}

const cursosEnBase = (codigo: string) =>
  bd.query<{ codigo: string; nombre: string; universidad: string }[]>(
    `SELECT c.codigo, c.nombre, un.dominio_correo AS universidad
       FROM curso c JOIN universidad un ON un.id = c.universidad_id
      WHERE c.codigo = $1`,
    [codigo],
  )

beforeAll(async () => {
  admin = await new DataSource(opcionesDataSource()).initialize()
  await admin.query(`DROP DATABASE IF EXISTS "${BD_TEST}" WITH (FORCE)`)
  await admin.query(`CREATE DATABASE "${BD_TEST}"`)
  bd = await new DataSource(opcionesDataSource(BD_TEST)).initialize()
  await bd.runMigrations()
  await ejecutarSeed(bd, PASSWORD)

  // La API se conecta a la base de este test.
  process.env.POSTGRES_DB = BD_TEST
  const modulo = await Test.createTestingModule({
    imports: [AppModule],
  }).compile()
  app = modulo.createNestApplication<INestApplication<App>>({ logger: false })
  configurarApp(app, { secretoOrigen: '' })
  await app.init()
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

describe('GET /api/periodos', () => {
  it('devuelve los de su universidad, con el activo primero', async () => {
    const [{ id: norte }] = await bd.query<{ id: string }[]>(
      "SELECT id FROM universidad WHERE dominio_correo = 'norte.cursus.test'",
    )
    await bd.query(
      `INSERT INTO periodo (universidad_id, anio, semestre, fecha_inicio, fecha_termino)
       VALUES ($1, 2027, 1, '2027-03-01', '2027-07-15')`,
      [norte],
    )

    const periodos = await get<OpcionPeriodo[]>(
      ADMIN_INGENIERIA,
      '/api/periodos',
    )
    expect(periodos.map((p) => [p.anio, p.semestre, p.activo])).toEqual([
      [2026, 2, true],
      [2027, 1, false],
    ])
    const sur = await get<OpcionPeriodo[]>(ADMIN_SUR, '/api/periodos')
    expect(sur.map((p) => p.id)).not.toContain(periodos[1].id)
  })
})

describe('POST /api/cursos', () => {
  it('usa una carrera creada y editada desde CarrerasController', async () => {
    const token = await tokenDe(ADMIN_INGENIERIA)
    const respuesta = await request(app.getHttpServer())
      .post('/api/carreras')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Carrera para cursos' })
      .expect(201)
    const carrera = respuesta.body as Carrera
    await request(app.getHttpServer())
      .patch(`/api/carreras/${carrera.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Carrera editada para cursos' })
      .expect(200)

    const carreras = await get<Carrera[]>(ADMIN_INGENIERIA, '/api/carreras')
    expect(carreras).toContainEqual({
      id: carrera.id,
      nombre: 'Carrera editada para cursos',
    })
    const [periodo] = await get<OpcionPeriodo[]>(
      ADMIN_INGENIERIA,
      '/api/periodos',
    )
    const curso = await crear(
      ADMIN_INGENIERIA,
      {
        carreraId: carrera.id,
        periodoId: periodo.id,
        codigo: 'INTEGRACION01',
        nombre: 'Curso de la carrera editada',
      },
      201,
    )
    expect(curso.carreraNombre).toBe('Carrera editada para cursos')
    // Las otras pruebas usan las opciones originales del seed.
    await bd.query('UPDATE carrera SET archived_at = now() WHERE id = $1', [
      carrera.id,
    ])
  })

  it('crea el curso en su universidad y responde 201', async () => {
    const curso = await crear(
      ADMIN_INGENIERIA,
      {
        ...(await opcionesDe(ADMIN_INGENIERIA)),
        codigo: ' icc4103 ',
        nombre: ' Tecnologías Web ',
      },
      201,
    )
    expect(curso).toMatchObject({
      codigo: 'ICC4103',
      nombre: 'Tecnologías Web',
      carreraNombre: 'Ingeniería Civil en Informática',
      periodo: { anio: 2026, semestre: 2 },
    })
    expect(await cursosEnBase('ICC4103')).toEqual([
      {
        codigo: 'ICC4103',
        nombre: 'Tecnologías Web',
        universidad: 'norte.cursus.test',
      },
    ])
  })

  it('responde 409 si el código ya existe en el período', async () => {
    const opciones = await opcionesDe(ADMIN_INGENIERIA)
    await crear(
      ADMIN_INGENIERIA,
      { ...opciones, codigo: 'ICC101', nombre: 'Programación' },
      201,
    )
    const respuesta = await crear(
      ADMIN_INGENIERIA,
      { ...opciones, codigo: 'icc101', nombre: 'Otro nombre' },
      409,
    )
    expect(respuesta.message).toBe(
      'Ya existe un curso con el código ICC101 en el período 2026-2',
    )
  })

  it('el mismo código sirve en otra universidad', async () => {
    await crear(
      ADMIN_SUR,
      { ...(await opcionesDe(ADMIN_SUR)), codigo: 'ICC101', nombre: 'Otro' },
      201,
    )
  })

  it('responde 404 con una carrera de otra facultad', async () => {
    const { carreraId } = await opcionesDe(ADMIN_ECONOMIA)
    const { periodoId } = await opcionesDe(ADMIN_INGENIERIA)
    await crear(
      ADMIN_INGENIERIA,
      { carreraId, periodoId, codigo: 'X101', nombre: 'Curso' },
      404,
    )
    expect(await cursosEnBase('X101')).toEqual([])
  })

  it('responde 404 con una carrera de otra universidad', async () => {
    const { carreraId } = await opcionesDe(ADMIN_SUR)
    const { periodoId } = await opcionesDe(ADMIN_INGENIERIA)
    await crear(
      ADMIN_INGENIERIA,
      { carreraId, periodoId, codigo: 'X102', nombre: 'Curso' },
      404,
    )
    expect(await cursosEnBase('X102')).toEqual([])
  })

  it('responde 404 con un período de otra universidad', async () => {
    const { carreraId } = await opcionesDe(ADMIN_INGENIERIA)
    const { periodoId } = await opcionesDe(ADMIN_SUR)
    await crear(
      ADMIN_INGENIERIA,
      { carreraId, periodoId, codigo: 'X103', nombre: 'Curso' },
      404,
    )
  })

  it('responde 404 con una carrera archivada', async () => {
    const opciones = await opcionesDe(ADMIN_ECONOMIA)
    await bd.query('UPDATE carrera SET archived_at = now() WHERE id = $1', [
      opciones.carreraId,
    ])
    try {
      await crear(
        ADMIN_ECONOMIA,
        { ...opciones, codigo: 'X104', nombre: 'Curso' },
        404,
      )
    } finally {
      await bd.query('UPDATE carrera SET archived_at = NULL WHERE id = $1', [
        opciones.carreraId,
      ])
    }
  })

  it('el Director recibe 403 y no se crea nada', async () => {
    const { carreraId, periodoId } = await opcionesDe(ADMIN_INGENIERIA)
    await crear(
      DIRECTOR,
      { carreraId, periodoId, codigo: 'DIR101', nombre: 'Curso' },
      403,
    )
    expect(await cursosEnBase('DIR101')).toEqual([])
  })
})
