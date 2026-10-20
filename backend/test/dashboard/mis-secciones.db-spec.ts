import type { SeccionDashboard } from '@cursus/shared'
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

// ESP-01: base propia con el seed cargado, que se crea y se borra en cada
// ejecución.
const BD_TEST = `${process.env.POSTGRES_TEST_DB ?? 'cursus_test'}_mis_secciones`
const PASSWORD = 'contraseña-de-prueba'
// Hash con formato válido; estos alumnos no inician sesión.
const HASH = '$2b$10$abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOP'
const BD_ORIGINAL = process.env.POSTGRES_DB

const PROFESOR = 'profesor@norte.cursus.test'
const PROFESOR_SUR = 'profesor@sur.cursus.test'
const ALUMNO = 'alumno@norte.cursus.test'
const DIRECTOR = 'director@norte.cursus.test'
const ADMIN_INGENIERIA = 'administrativo.ingenieria@norte.cursus.test'

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
async function misSecciones(correo: string) {
  const token = await tokenDe(correo)
  const respuesta = await request(app.getHttpServer())
    .get('/api/dashboard/mis-secciones')
    .set('Authorization', `Bearer ${token}`)
    .expect(200)
  return respuesta.body as SeccionDashboard[]
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

const asignarProfesor = (seccionId: string, profesorId: string) =>
  bd.query('UPDATE seccion SET profesor_id = $2 WHERE id = $1', [
    seccionId,
    profesorId,
  ])

// Crea alumnos de Norte y los inscribe en la sección; los de `archivadas`
// quedan con la inscripción archivada.
async function inscribir(seccionId: string, activas: number, archivadas = 0) {
  const responsable = await idDe(ADMIN_INGENIERIA)
  for (let i = 0; i < activas + archivadas; i++) {
    const archivada = i >= activas
    await bd.query(
      `WITH alumno AS (
         INSERT INTO usuario (universidad_id, nombre, correo, password_hash, rol)
         SELECT universidad_id, $2, $3, $4, 'ALUMNO' FROM seccion WHERE id = $1
         RETURNING id, universidad_id
       )
       INSERT INTO inscripcion (universidad_id, seccion_id, usuario_id, archived_at, archivada_por)
       SELECT universidad_id, $1, id,
              CASE WHEN $5::uuid IS NULL THEN NULL ELSE now() END, $5
         FROM alumno`,
      [
        seccionId,
        `Alumno ${i}`,
        `alumno.${i}.${seccionId.slice(0, 8)}@norte.cursus.test`,
        HASH,
        archivada ? responsable : null,
      ],
    )
  }
}

const bloque = (
  seccionId: string,
  dia: number,
  inicio: string,
  termino: string,
  sala: string,
  archivado = false,
) =>
  bd.query(
    `INSERT INTO horario_seccion (universidad_id, seccion_id, dia, inicio, termino, sala, archived_at)
     SELECT universidad_id, $1, $2, $3, $4, $5, ${archivado ? 'now()' : 'NULL'}
       FROM seccion WHERE id = $1`,
    [seccionId, dia, inicio, termino, sala],
  )

const ids = { icc101s1: '', icc201s2: '', ico101s1: '' }

// Escenario, armado como dueño de las tablas (sin RLS). El profesor base
// queda a cargo de ICC101-1, ICC201-2 e ICO101-1 (de otra facultad) en el
// período activo, y además de secciones que no deben aparecer.
async function armarEscenario() {
  const profesor = await idDe(PROFESOR)
  ids.icc101s1 = await seccionDe('ICC101', 1)
  ids.icc201s2 = await seccionDe('ICC201', 2)
  ids.ico101s1 = await seccionDe('ICO101', 1)
  for (const id of Object.values(ids)) {
    await asignarProfesor(id, profesor)
  }

  // ICC101-1: dos bloques activos (desordenados) y uno archivado; dos
  // alumnos activos y uno con la inscripción archivada.
  await bloque(ids.icc101s1, 3, '10:00', '11:30', 'Sala B-202')
  await bloque(ids.icc101s1, 1, '08:30', '10:00', 'Sala A-101')
  await bloque(ids.icc101s1, 5, '08:30', '10:00', 'Sala Z-999', true)
  await inscribir(ids.icc101s1, 2, 1)

  // ICC101-2 es de otro profesor.
  const [{ id: otroProfesor }] = await bd.query<{ id: string }[]>(
    `SELECT u.id FROM usuario u JOIN universidad un ON un.id = u.universidad_id
      WHERE u.rol = 'PROFESOR' AND un.dominio_correo = 'norte.cursus.test'
        AND u.correo <> $1 ORDER BY u.correo LIMIT 1`,
    [PROFESOR],
  )
  await asignarProfesor(await seccionDe('ICC101', 2), otroProfesor)

  // Sección archivada y sección de un curso archivado, a su cargo.
  const [{ id: archivada }] = await bd.query<{ id: string }[]>(
    `INSERT INTO seccion (universidad_id, curso_id, numero, archived_at, profesor_id)
     SELECT universidad_id, curso_id, 3, now(), $2 FROM seccion WHERE id = $1
     RETURNING id`,
    [ids.icc101s1, profesor],
  )
  expect(archivada).toBeTruthy()
  const ico201s1 = await seccionDe('ICO201', 1)
  await asignarProfesor(ico201s1, profesor)
  await bd.query(
    `UPDATE curso SET archived_at = now()
      WHERE id = (SELECT curso_id FROM seccion WHERE id = $1)`,
    [ico201s1],
  )

  // Una sección de otro período (no activo), a su cargo.
  await bd.query(
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
     INSERT INTO seccion (universidad_id, curso_id, numero, profesor_id)
     SELECT universidad_id, id, 1, $2 FROM c`,
    [ids.icc101s1, profesor],
  )
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

describe('GET /api/dashboard/mis-secciones (ESP-01)', () => {
  it('devuelve una tarjeta por sección a su cargo en el período activo', async () => {
    const secciones = await misSecciones(PROFESOR)

    // Ordenadas por código de curso y número; sin la sección de otro
    // profesor, la archivada, la de un curso archivado ni la de otro período.
    expect(secciones.map((s) => [s.curso.codigo, s.numero])).toEqual([
      ['ICC101', 1],
      ['ICC201', 2],
      ['ICO101', 1],
    ])
    expect(secciones.map((s) => s.id)).toEqual([
      ids.icc101s1,
      ids.icc201s2,
      ids.ico101s1,
    ])
  })

  it('cada tarjeta trae curso, número, horario y cantidad de alumnos', async () => {
    const [icc101] = await misSecciones(PROFESOR)

    expect(icc101).toEqual({
      id: ids.icc101s1,
      numero: 1,
      curso: {
        id: expect.any(String) as string,
        codigo: 'ICC101',
        nombre: 'Introducción a la Programación',
      },
      // Sin el bloque archivado, por día y hora.
      horario: [
        { dia: 1, inicio: '08:30', termino: '10:00', sala: 'Sala A-101' },
        { dia: 3, inicio: '10:00', termino: '11:30', sala: 'Sala B-202' },
      ],
      // Sin la inscripción archivada.
      alumnos: 2,
    } satisfies SeccionDashboard)
  })

  it('una sección sin horario ni alumnos trae listas en cero', async () => {
    const secciones = await misSecciones(PROFESOR)
    const icc201 = secciones.find((s) => s.id === ids.icc201s2)

    expect(icc201).toMatchObject({ horario: [], alumnos: 0 })
  })

  it('un profesor sin secciones recibe una lista vacía', async () => {
    expect(await misSecciones(PROFESOR_SUR)).toEqual([])
  })

  it.each([ALUMNO, DIRECTOR, ADMIN_INGENIERIA])(
    '%s recibe una lista vacía (ESP-01 es solo del profesor)',
    async (correo) => {
      expect(await misSecciones(correo)).toEqual([])
    },
  )

  it('sin período activo la lista queda vacía', async () => {
    const marcarActivo = (activo: boolean) =>
      bd.query(
        `UPDATE periodo SET activo = $1
          WHERE id = (SELECT c.periodo_id FROM seccion s
                        JOIN curso c ON c.id = s.curso_id WHERE s.id = $2)`,
        [activo, ids.icc101s1],
      )
    await tokenDe(PROFESOR)
    await marcarActivo(false)
    try {
      expect(await misSecciones(PROFESOR)).toEqual([])
    } finally {
      await marcarActivo(true)
    }
  })

  it('responde 401 sin sesión', async () => {
    await request(app.getHttpServer())
      .get('/api/dashboard/mis-secciones')
      .expect(401)
  })
})
