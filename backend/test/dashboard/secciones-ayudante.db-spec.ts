import type { SeccionAyudante } from '@cursus/shared'
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

// ESP-02: base propia con el seed cargado, que se crea y se borra en cada
// ejecución.
const BD_TEST = `${process.env.POSTGRES_TEST_DB ?? 'cursus_test'}_secciones_ayudante`
const PASSWORD = 'contraseña-de-prueba'
const BD_ORIGINAL = process.env.POSTGRES_DB

const AYUDANTE = 'ayudante@norte.cursus.test'
const PROFESOR = 'profesor@norte.cursus.test'
const ALUMNO = 'alumno@norte.cursus.test'

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
async function seccionesAyudante(correo: string) {
  const token = await tokenDe(correo)
  const respuesta = await request(app.getHttpServer())
    .get('/api/dashboard/secciones-ayudante')
    .set('Authorization', `Bearer ${token}`)
    .expect(200)
  return respuesta.body as SeccionAyudante[]
}

const idDe = async (correo: string) =>
  (
    await bd.query<{ id: string }[]>(
      'SELECT id FROM usuario WHERE correo = $1',
      [correo],
    )
  )[0].id

const seccionDe = async (codigo: string, numero: number) =>
  (
    await bd.query<{ id: string }[]>(
      `SELECT s.id FROM seccion s JOIN curso c ON c.id = s.curso_id
        WHERE c.codigo = $1 AND s.numero = $2`,
      [codigo, numero],
    )
  )[0].id

const asignarProfesor = (seccionId: string, profesorId: string | null) =>
  bd.query('UPDATE seccion SET profesor_id = $2 WHERE id = $1', [
    seccionId,
    profesorId,
  ])

const asignarAyudante = (
  seccionId: string,
  usuarioId: string,
  archivada = false,
) =>
  bd.query(
    `INSERT INTO ayudante_seccion (universidad_id, seccion_id, usuario_id, archived_at)
     SELECT universidad_id, $1, $2, ${archivada ? 'now()' : 'NULL'}
       FROM seccion WHERE id = $1`,
    [seccionId, usuarioId],
  )

const ids = {
  icc101s1: '',
  icc201s2: '',
  asignacionArchivada: '',
  seccionArchivada: '',
  cursoArchivado: '',
  otroPeriodo: '',
}

// Escenario, armado como dueño de las tablas (sin RLS). El ayudante base
// queda en ICC101-1 (con profesor) e ICC201-2 (sin profesor) en el período
// activo, y además en secciones que no deben aparecer.
async function armarEscenario() {
  const ayudante = await idDe(AYUDANTE)
  const profesor = await idDe(PROFESOR)
  ids.icc101s1 = await seccionDe('ICC101', 1)
  ids.icc201s2 = await seccionDe('ICC201', 2)
  await asignarProfesor(ids.icc101s1, profesor)
  await asignarProfesor(ids.icc201s2, null)
  await asignarAyudante(ids.icc101s1, ayudante)
  await asignarAyudante(ids.icc201s2, ayudante)

  // ICC101-2: la asignación del ayudante está archivada.
  ids.asignacionArchivada = await seccionDe('ICC101', 2)
  await asignarAyudante(ids.asignacionArchivada, ayudante, true)

  // Sección archivada.
  ;[{ id: ids.seccionArchivada }] = await bd.query<{ id: string }[]>(
    `INSERT INTO seccion (universidad_id, curso_id, numero, archived_at)
     SELECT universidad_id, curso_id, 3, now() FROM seccion WHERE id = $1
     RETURNING id`,
    [ids.icc101s1],
  )
  await asignarAyudante(ids.seccionArchivada, ayudante)

  // Sección de un curso archivado.
  ids.cursoArchivado = await seccionDe('ICO201', 1)
  await asignarAyudante(ids.cursoArchivado, ayudante)
  await bd.query(
    `UPDATE curso SET archived_at = now()
      WHERE id = (SELECT curso_id FROM seccion WHERE id = $1)`,
    [ids.cursoArchivado],
  )

  // Sección de otro período (no activo).
  ;[{ id: ids.otroPeriodo }] = await bd.query<{ id: string }[]>(
    `WITH p AS (
       INSERT INTO periodo (universidad_id, anio, semestre, fecha_inicio, fecha_termino, activo)
       SELECT universidad_id, 2025, 1, '2025-03-01', '2025-07-15', false
         FROM seccion WHERE id = $1
       RETURNING id, universidad_id
     ), c AS (
       INSERT INTO curso (universidad_id, carrera_id, periodo_id, codigo, nombre)
       SELECT p.universidad_id, cu.carrera_id, p.id, 'ICC101', 'Introducción a la Programación'
         FROM p, curso cu WHERE cu.codigo = 'ICC101' AND cu.universidad_id = p.universidad_id
       RETURNING id, universidad_id
     )
     INSERT INTO seccion (universidad_id, curso_id, numero)
     SELECT universidad_id, id, 1 FROM c
     RETURNING id`,
    [ids.icc101s1],
  )
  await asignarAyudante(ids.otroPeriodo, ayudante)
}

beforeAll(async () => {
  admin = await new DataSource(opcionesDataSource()).initialize()
  await admin.query(`DROP DATABASE IF EXISTS "${BD_TEST}" WITH (FORCE)`)
  await admin.query(`CREATE DATABASE "${BD_TEST}"`)
  bd = await new DataSource(opcionesDataSource(BD_TEST)).initialize()
  await bd.runMigrations()
  await ejecutarSeed(bd, PASSWORD)
  await armarEscenario()

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

describe('GET /api/dashboard/secciones-ayudante (ESP-02)', () => {
  it('devuelve una tarjeta por sección donde es ayudante en el período activo', async () => {
    const secciones = await seccionesAyudante(AYUDANTE)

    // Ordenadas por código de curso y número.
    expect(secciones.map((s) => s.id)).toEqual([ids.icc101s1, ids.icc201s2])
    expect(secciones.map((s) => [s.curso.codigo, s.numero])).toEqual([
      ['ICC101', 1],
      ['ICC201', 2],
    ])
  })

  it('cada tarjeta trae curso, número y profesor a cargo', async () => {
    const [icc101, icc201] = await seccionesAyudante(AYUDANTE)
    const [{ nombre }] = await bd.query<{ nombre: string }[]>(
      'SELECT nombre FROM usuario WHERE correo = $1',
      [PROFESOR],
    )

    expect(icc101).toEqual({
      id: ids.icc101s1,
      numero: 1,
      curso: {
        id: expect.any(String) as string,
        codigo: 'ICC101',
        nombre: 'Introducción a la Programación',
      },
      profesor: { id: await idDe(PROFESOR), nombre },
    } satisfies SeccionAyudante)
    // Sin profesor asignado.
    expect(icc201.profesor).toBeNull()
  })

  it('no incluye la sección de otro período', async () => {
    const secciones = await seccionesAyudante(AYUDANTE)
    expect(secciones.map((s) => s.id)).not.toContain(ids.otroPeriodo)
  })

  it('no incluye una asignación de ayudante archivada', async () => {
    const secciones = await seccionesAyudante(AYUDANTE)
    expect(secciones.map((s) => s.id)).not.toContain(ids.asignacionArchivada)
  })

  it('no incluye una sección archivada ni la de un curso archivado', async () => {
    const secciones = (await seccionesAyudante(AYUDANTE)).map((s) => s.id)
    expect(secciones).not.toContain(ids.seccionArchivada)
    expect(secciones).not.toContain(ids.cursoArchivado)
  })

  it.each([PROFESOR, ALUMNO])(
    '%s recibe una lista vacía (ESP-02 es solo del ayudante)',
    async (correo) => {
      expect(await seccionesAyudante(correo)).toEqual([])
    },
  )

  it('responde 401 sin sesión', async () => {
    await request(app.getHttpServer())
      .get('/api/dashboard/secciones-ayudante')
      .expect(401)
  })
})
