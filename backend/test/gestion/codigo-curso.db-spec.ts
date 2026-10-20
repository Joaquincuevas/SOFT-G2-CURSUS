import type { CursoCreado, Carrera, OpcionPeriodo } from '@cursus/shared'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { DataSource, QueryFailedError } from 'typeorm'
import { AppModule } from '../../src/app.module.js'
import type { RespuestaLogin } from '../../src/auth/auth.controller.js'
import { configurarApp } from '../../src/config/configurar-app.js'
import { opcionesDataSource } from '../../src/database/data-source.js'
import { ejecutarSeed } from '../../src/database/seed.js'

// GES-06 (RN-04): el código de un curso no se repite en un mismo período. El
// 409 al crear desde la API ya lo cubre crear-curso.db-spec.ts; aquí se prueba
// que el mismo código sirve en otro período y que la base aplica la regla sola,
// también al editar (UPDATE), sin pasar por la API.

const BD_TEST = `${process.env.POSTGRES_TEST_DB ?? 'cursus_test'}_codigo_curso`
const BD_ORIGINAL = process.env.POSTGRES_DB
const PASSWORD = 'password-solo-para-pruebas'
const ADMIN_INGENIERIA = 'administrativo.ingenieria@norte.cursus.test'

let admin: DataSource
let bd: DataSource
let app: INestApplication<App>
let token: string

// Ids de Norte: una carrera del administrativo, el período activo del seed
// (2026-2) y uno nuevo (2027-1).
let universidadId: string
let carreraId: string
let periodoActivo: string
let otroPeriodo: string

async function crear(codigo: string, periodoId: string, estado: number) {
  const respuesta = await request(app.getHttpServer())
    .post('/api/cursos')
    .set('Authorization', `Bearer ${token}`)
    .send({ carreraId, periodoId, codigo, nombre: `Curso ${codigo}` })
    .expect(estado)
  return respuesta.body as CursoCreado & { message: string }
}

// Escrituras directas, como dueño de las tablas: no pasan por la API ni por
// CrearCursoDto, que es lo que normaliza el código.
const insertar = (codigo: string, periodoId: string) =>
  bd.query<{ id: string }[]>(
    `INSERT INTO curso (universidad_id, carrera_id, periodo_id, codigo, nombre)
     VALUES ($1, $2, $3, $4, 'Curso directo') RETURNING id`,
    [universidadId, carreraId, periodoId, codigo],
  )

// Restricción que rechazó la escritura (código 23505), o undefined si pasó.
async function restriccionViolada(escritura: Promise<unknown>) {
  try {
    await escritura
    return undefined
  } catch (error) {
    if (!(error instanceof QueryFailedError)) throw error
    const fallo = error.driverError as { code?: string; constraint?: string }
    expect(fallo.code).toBe('23505')
    return fallo.constraint
  }
}

const cantidadConCodigo = async (codigo: string) => {
  const [{ cantidad }] = await bd.query<{ cantidad: string }[]>(
    `SELECT count(*) AS cantidad FROM curso
      WHERE upper(btrim(codigo)) = upper(btrim($1))`,
    [codigo],
  )
  return Number(cantidad)
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
  await app.init()

  const login = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ correo: ADMIN_INGENIERIA, password: PASSWORD })
    .expect(200)
  token = (login.body as RespuestaLogin).accessToken

  // Las opciones salen de la API, como en el formulario.
  const carreras = await request(app.getHttpServer())
    .get('/api/carreras')
    .set('Authorization', `Bearer ${token}`)
    .expect(200)
  carreraId = (carreras.body as Carrera[])[0].id
  const periodos = await request(app.getHttpServer())
    .get('/api/periodos')
    .set('Authorization', `Bearer ${token}`)
    .expect(200)
  periodoActivo = (periodos.body as OpcionPeriodo[])[0].id

  ;[{ universidadId }] = await bd.query<{ universidadId: string }[]>(
    `SELECT universidad_id AS "universidadId" FROM periodo WHERE id = $1`,
    [periodoActivo],
  )
  ;[{ id: otroPeriodo }] = await bd.query<{ id: string }[]>(
    `INSERT INTO periodo (universidad_id, anio, semestre, fecha_inicio, fecha_termino)
     VALUES ($1, 2027, 1, '2027-03-01', '2027-07-15') RETURNING id`,
    [universidadId],
  )
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

describe('POST /api/cursos con un código usado en otro período', () => {
  it('lo crea en el otro período y sigue rechazando el mismo período', async () => {
    await crear('GES601', periodoActivo, 201)
    const enOtro = await crear('ges601', otroPeriodo, 201)
    expect(enOtro).toMatchObject({
      codigo: 'GES601',
      periodo: { anio: 2027, semestre: 1 },
    })

    const repetido = await crear('GES601', otroPeriodo, 409)
    expect(repetido.message).toBe(
      'Ya existe un curso con el código GES601 en el período 2027-1',
    )
    expect(await cantidadConCodigo('GES601')).toBe(2)
  })
})

describe('restricción en la base de datos', () => {
  it('rechaza un INSERT con el mismo código en el período', async () => {
    await insertar('BD101', periodoActivo)

    expect(await restriccionViolada(insertar('BD101', periodoActivo))).toBe(
      'uq_curso_codigo_periodo',
    )
    expect(await cantidadConCodigo('BD101')).toBe(1)
  })

  it.each([
    ['en minúsculas', 'bd102'],
    ['con espacios', '  BD102 '],
    ['mezclando ambos', ' Bd102'],
  ])(
    'rechaza un INSERT del mismo código %s, aunque no pase por la API',
    async (_caso, variante) => {
      await insertar('BD102', periodoActivo).catch(() => undefined)

      expect(await restriccionViolada(insertar(variante, periodoActivo))).toBe(
        'ux_curso_periodo_codigo_normalizado',
      )
      expect(await cantidadConCodigo('BD102')).toBe(1)
    },
  )

  it('permite el mismo código en otro período', async () => {
    await insertar('BD103', periodoActivo)

    expect(
      await restriccionViolada(insertar('bd103', otroPeriodo)),
    ).toBeUndefined()
    expect(await cantidadConCodigo('BD103')).toBe(2)
  })

  // GES-07 (editar curso) todavía no existe: estas pruebas aseguran que un
  // UPDATE tampoco puede dejar dos cursos con el mismo código en un período.
  it('rechaza un UPDATE que cambia el código a uno ya usado en el período', async () => {
    await insertar('BD104', periodoActivo)
    const [{ id }] = await insertar('BD105', periodoActivo)

    expect(
      await restriccionViolada(
        bd.query(`UPDATE curso SET codigo = 'bd104' WHERE id = $1`, [id]),
      ),
    ).toBe('ux_curso_periodo_codigo_normalizado')
    const [{ codigo }] = await bd.query<{ codigo: string }[]>(
      'SELECT codigo FROM curso WHERE id = $1',
      [id],
    )
    expect(codigo).toBe('BD105')
  })

  it('rechaza un UPDATE que mueve el curso a un período donde el código ya existe', async () => {
    await insertar('BD106', otroPeriodo)
    const [{ id }] = await insertar('BD106', periodoActivo)

    expect(
      await restriccionViolada(
        bd.query('UPDATE curso SET periodo_id = $1 WHERE id = $2', [
          otroPeriodo,
          id,
        ]),
      ),
    ).toBe('uq_curso_codigo_periodo')
    const [{ periodo }] = await bd.query<{ periodo: string }[]>(
      'SELECT periodo_id AS periodo FROM curso WHERE id = $1',
      [id],
    )
    expect(periodo).toBe(periodoActivo)
  })

  it('un curso archivado sigue ocupando su código en el período', async () => {
    const [{ id }] = await insertar('BD107', periodoActivo)
    await bd.query('UPDATE curso SET archived_at = now() WHERE id = $1', [id])

    expect(await restriccionViolada(insertar('BD107', periodoActivo))).toBe(
      'uq_curso_codigo_periodo',
    )
  })
})
