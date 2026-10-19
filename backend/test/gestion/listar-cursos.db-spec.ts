import type { CursoListado } from '@cursus/shared'
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

// Base propia con el seed cargado (con sus cursos), que se crea y se borra en
// cada ejecución.
const BD_TEST = `${process.env.POSTGRES_TEST_DB ?? 'cursus_test'}_listado`
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
async function cursosDe(correo: string): Promise<CursoListado[]> {
  const token = await tokenDe(correo)
  const respuesta = await request(app.getHttpServer())
    .get('/api/cursos')
    .set('Authorization', `Bearer ${token}`)
    .expect(200)
  return respuesta.body as CursoListado[]
}

const codigos = (cursos: CursoListado[]) => cursos.map((c) => c.codigo)

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

describe('GET /api/cursos', () => {
  it('el Administrativo ve los cursos de su facultad con sus columnas', async () => {
    const cursos = await cursosDe(ADMIN_INGENIERIA)
    expect(codigos(cursos)).toEqual(['ICC101', 'ICC201'])
    expect(cursos[0]).toEqual({
      id: expect.any(String) as string,
      codigo: 'ICC101',
      nombre: 'Introducción a la Programación',
      carreraNombre: 'Ingeniería Civil en Informática',
      periodo: {
        id: expect.any(String) as string,
        anio: 2026,
        semestre: 2,
      },
      secciones: 0,
    })
  })

  it('no ve cursos de otra facultad ni de otra universidad', async () => {
    expect(codigos(await cursosDe(ADMIN_ECONOMIA))).toEqual([
      'ICO101',
      'ICO201',
    ])
    expect(codigos(await cursosDe(ADMIN_SUR))).toEqual(['ENF101', 'ENF201'])
  })

  it('el Director ve los cursos de todas las universidades con su nombre', async () => {
    const cursos = await cursosDe(DIRECTOR)
    expect(cursos.map((c) => [c.codigo, c.universidadNombre]).sort()).toEqual([
      ['ENF101', 'Universidad Demo Sur'],
      ['ENF201', 'Universidad Demo Sur'],
      ['ICC101', 'Universidad Demo Norte'],
      ['ICC201', 'Universidad Demo Norte'],
      ['ICO101', 'Universidad Demo Norte'],
      ['ICO201', 'Universidad Demo Norte'],
    ])
  })

  it('no muestra los cursos archivados', async () => {
    await bd.query(
      "UPDATE curso SET archived_at = now() WHERE codigo = 'ICC201'",
    )
    try {
      expect(codigos(await cursosDe(ADMIN_INGENIERIA))).toEqual(['ICC101'])
      expect(codigos(await cursosDe(DIRECTOR))).not.toContain('ICC201')
    } finally {
      await bd.query(
        "UPDATE curso SET archived_at = NULL WHERE codigo = 'ICC201'",
      )
    }
  })

  it('pone primero los cursos del período activo y después ordena por código', async () => {
    // Un curso de un período anterior (no activo), con un código menor.
    const [{ universidad, carrera }] = await bd.query<
      { universidad: string; carrera: string }[]
    >(
      `SELECT ca.universidad_id AS universidad, ca.id AS carrera FROM carrera ca
        WHERE ca.nombre = 'Ingeniería Civil en Informática'`,
    )
    const [{ id: periodo }] = await bd.query<{ id: string }[]>(
      `INSERT INTO periodo (universidad_id, anio, semestre, fecha_inicio, fecha_termino)
       VALUES ($1, 2026, 1, '2026-03-02', '2026-07-10') RETURNING id`,
      [universidad],
    )
    await bd.query(
      `INSERT INTO curso (universidad_id, carrera_id, periodo_id, codigo, nombre)
       VALUES ($1, $2, $3, 'ICC001', 'Curso anterior')`,
      [universidad, carrera, periodo],
    )

    const cursos = await cursosDe(ADMIN_INGENIERIA)
    expect(cursos.map((c) => [c.codigo, c.periodo.semestre])).toEqual([
      ['ICC101', 2],
      ['ICC201', 2],
      ['ICC001', 1],
    ])
  })
})
