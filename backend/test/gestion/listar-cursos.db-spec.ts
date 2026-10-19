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
async function cursosDe(
  correo: string,
  filtro: Record<string, string> = {},
): Promise<CursoListado[]> {
  const token = await tokenDe(correo)
  const respuesta = await request(app.getHttpServer())
    .get('/api/cursos')
    .query(filtro)
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

describe('GET /api/cursos con filtros (GES-04)', () => {
  // Una segunda carrera en Ingeniería Norte y un período 2027-1, con cursos
  // para combinar los filtros. Se crean como dueño de las tablas.
  let industrial: string
  let informatica: string
  let activoNorte: string
  let periodo2027: string
  let periodoSur: string
  let carreraSur: string

  const idDe = async (sql: string, parametros: unknown[] = []) =>
    (await bd.query<{ id: string }[]>(sql, parametros))[0].id

  beforeAll(async () => {
    informatica = await idDe(
      "SELECT id FROM carrera WHERE nombre = 'Ingeniería Civil en Informática'",
    )
    const [{ universidad, facultad }] = await bd.query<
      { universidad: string; facultad: string }[]
    >(
      'SELECT universidad_id AS universidad, facultad_id AS facultad FROM carrera WHERE id = $1',
      [informatica],
    )
    industrial = await idDe(
      `INSERT INTO carrera (universidad_id, facultad_id, nombre)
       VALUES ($1, $2, 'Ingeniería Civil Industrial') RETURNING id`,
      [universidad, facultad],
    )
    activoNorte = await idDe(
      'SELECT id FROM periodo WHERE universidad_id = $1 AND activo',
      [universidad],
    )
    periodo2027 = await idDe(
      `INSERT INTO periodo (universidad_id, anio, semestre, fecha_inicio, fecha_termino)
       VALUES ($1, 2027, 1, '2027-03-01', '2027-07-15') RETURNING id`,
      [universidad],
    )
    for (const [codigo, carrera, periodo] of [
      ['IND101', industrial, activoNorte],
      ['IND201', industrial, periodo2027],
      ['ICC501', informatica, periodo2027],
    ]) {
      await bd.query(
        `INSERT INTO curso (universidad_id, carrera_id, periodo_id, codigo, nombre)
         VALUES ($1, $2, $3, $4, 'Curso de prueba')`,
        [universidad, carrera, periodo, codigo],
      )
    }
    periodoSur = await idDe(
      `SELECT p.id FROM periodo p JOIN universidad un ON un.id = p.universidad_id
        WHERE un.dominio_correo = 'sur.cursus.test' AND p.activo`,
    )
    carreraSur = await idDe(
      "SELECT id FROM carrera WHERE nombre = 'Enfermería'",
    )
  })

  const ordenados = (cursos: CursoListado[]) => codigos(cursos).sort()

  it('sin filtros devuelve todos los cursos de la facultad, como en GES-03', async () => {
    const esperados = await bd.query<{ codigo: string }[]>(
      `SELECT c.codigo FROM curso c JOIN carrera ca ON ca.id = c.carrera_id
        WHERE ca.facultad_id = (SELECT facultad_id FROM carrera WHERE id = $1)
          AND c.archived_at IS NULL`,
      [informatica],
    )
    const cursos = await cursosDe(ADMIN_INGENIERIA)
    expect(ordenados(cursos)).toEqual(esperados.map((c) => c.codigo).sort())
    // El período activo sigue primero.
    expect(cursos[0].periodo.id).toBe(activoNorte)
  })

  it('filtra por carrera', async () => {
    expect(
      codigos(await cursosDe(ADMIN_INGENIERIA, { carreraId: industrial })),
    ).toEqual(['IND101', 'IND201'])
  })

  it('filtra por período', async () => {
    expect(
      codigos(await cursosDe(ADMIN_INGENIERIA, { periodoId: periodo2027 })),
    ).toEqual(['ICC501', 'IND201'])
  })

  it('combina carrera y período', async () => {
    expect(
      codigos(
        await cursosDe(ADMIN_INGENIERIA, {
          carreraId: industrial,
          periodoId: periodo2027,
        }),
      ),
    ).toEqual(['IND201'])
    expect(
      codigos(
        await cursosDe(ADMIN_INGENIERIA, {
          carreraId: informatica,
          periodoId: activoNorte,
        }),
      ),
    ).toEqual(['ICC101', 'ICC201'])
  })

  it('un id de otra universidad devuelve una lista vacía', async () => {
    expect(await cursosDe(ADMIN_INGENIERIA, { periodoId: periodoSur })).toEqual(
      [],
    )
    expect(await cursosDe(ADMIN_INGENIERIA, { carreraId: carreraSur })).toEqual(
      [],
    )
  })

  it('el Director también puede filtrar, en todas las universidades', async () => {
    const cursos = await cursosDe(DIRECTOR, { periodoId: periodoSur })
    expect(codigos(cursos)).toEqual(['ENF101', 'ENF201'])
    expect(new Set(cursos.map((c) => c.universidadNombre))).toEqual(
      new Set(['Universidad Demo Sur']),
    )
  })

  it('responde 400 con un id que no es uuid', async () => {
    const token = await tokenDe(ADMIN_INGENIERIA)
    await request(app.getHttpServer())
      .get('/api/cursos')
      .query({ carreraId: 'no-es-uuid' })
      .set('Authorization', `Bearer ${token}`)
      .expect(400)
  })
})
