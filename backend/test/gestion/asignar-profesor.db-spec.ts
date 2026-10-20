import type {
  CursoDetalle,
  ProfesorOpcion,
  SeccionDetalle,
} from '@cursus/shared'
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

// Base propia con el seed cargado (cursos con las secciones 1 y 2, y
// profesores en cada facultad), que se crea y se borra en cada ejecución
// (GES-12).
const BD_TEST = `${process.env.POSTGRES_TEST_DB ?? 'cursus_test'}_asignar_profesor`
const PASSWORD = 'contraseña-de-prueba'
const BD_ORIGINAL = process.env.POSTGRES_DB

// Usuarios del seed.
const ADMIN_INGENIERIA = 'administrativo.ingenieria@norte.cursus.test'
const ADMIN_ECONOMIA = 'administrativo.economia@norte.cursus.test'
const ADMIN_SUR = 'administrativo@sur.cursus.test'
const DIRECTOR = 'director@norte.cursus.test'
const PROFESOR_NORTE = 'profesor@norte.cursus.test'
const PROFESOR_SUR = 'profesor@sur.cursus.test'
const ALUMNO_NORTE = 'alumno@norte.cursus.test'

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
async function listarProfesores(correo: string, estado = 200) {
  const token = await tokenDe(correo)
  const respuesta = await request(app.getHttpServer())
    .get('/api/profesores')
    .set('Authorization', `Bearer ${token}`)
    .expect(estado)
  return respuesta.body as ProfesorOpcion[]
}

async function asignar(
  correo: string,
  seccionId: string,
  profesorId: string,
  estado = 200,
) {
  const token = await tokenDe(correo)
  const respuesta = await request(app.getHttpServer())
    .put(`/api/secciones/${seccionId}/profesor`)
    .set('Authorization', `Bearer ${token}`)
    .send({ profesorId })
    .expect(estado)
  return respuesta.body as SeccionDetalle & { message: string }
}

async function detalle(correo: string, cursoId: string) {
  const token = await tokenDe(correo)
  const respuesta = await request(app.getHttpServer())
    .get(`/api/cursos/${cursoId}`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200)
  return respuesta.body as CursoDetalle
}

const idCurso = async (codigo: string) =>
  (
    await bd.query<{ id: string }[]>('SELECT id FROM curso WHERE codigo = $1', [
      codigo,
    ])
  )[0].id

// Sección del seed por código de curso y número.
const idSeccion = async (codigo: string, numero: number) =>
  (
    await bd.query<{ id: string }[]>(
      `SELECT s.id FROM seccion s JOIN curso c ON c.id = s.curso_id
        WHERE c.codigo = $1 AND s.numero = $2`,
      [codigo, numero],
    )
  )[0].id

const idUsuario = async (correo: string) =>
  (
    await bd.query<{ id: string }[]>(
      'SELECT id FROM usuario WHERE correo = $1',
      [correo],
    )
  )[0].id

const profesorDe = async (seccionId: string) =>
  (
    await bd.query<{ profesor_id: string | null }[]>(
      'SELECT profesor_id FROM seccion WHERE id = $1',
      [seccionId],
    )
  )[0].profesor_id

// Profesores de una universidad según la base, para comparar con la API.
const profesoresEnBase = (dominio: string) =>
  bd.query<ProfesorOpcion[]>(
    `SELECT u.id, u.nombre FROM usuario u
       JOIN universidad un ON un.id = u.universidad_id
      WHERE un.dominio_correo = $1 AND u.rol = 'PROFESOR'
        AND u.archived_at IS NULL
      ORDER BY u.nombre, u.id`,
    [dominio],
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
  await app.listen(0)
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

describe('GET /api/profesores', () => {
  it('lista solo los profesores de su universidad, de todas sus facultades', async () => {
    const profesores = await listarProfesores(ADMIN_INGENIERIA)

    expect(profesores).toEqual(await profesoresEnBase('norte.cursus.test'))
    // Norte tiene dos facultades: la lista incluye las dos.
    const [{ facultades }] = await bd.query<{ facultades: number }[]>(
      `SELECT count(DISTINCT facultad_id)::int AS facultades FROM usuario
        WHERE id = ANY($1)`,
      [profesores.map((p) => p.id)],
    )
    expect(facultades).toBe(2)
    const ids = profesores.map((p) => p.id)
    for (const deSur of await profesoresEnBase('sur.cursus.test')) {
      expect(ids).not.toContain(deSur.id)
    }
  })

  it('el administrativo de otra universidad ve solo los suyos', async () => {
    expect(await listarProfesores(ADMIN_SUR)).toEqual(
      await profesoresEnBase('sur.cursus.test'),
    )
  })

  it('no incluye profesores archivados ni usuarios de otros roles', async () => {
    const id = await idUsuario(PROFESOR_NORTE)
    await bd.query('UPDATE usuario SET archived_at = now() WHERE id = $1', [id])
    try {
      const ids = (await listarProfesores(ADMIN_INGENIERIA)).map((p) => p.id)
      expect(ids).not.toContain(id)
      expect(ids).not.toContain(await idUsuario(ALUMNO_NORTE))
    } finally {
      await bd.query('UPDATE usuario SET archived_at = NULL WHERE id = $1', [
        id,
      ])
    }
  })

  it('el Director recibe 403', async () => {
    await listarProfesores(DIRECTOR, 403)
  })
})

describe('PUT /api/secciones/:id/profesor', () => {
  it('asigna el profesor y el detalle del curso lo muestra', async () => {
    const seccionId = await idSeccion('ICC101', 1)
    const profesorId = await idUsuario(PROFESOR_NORTE)

    const seccion = await asignar(ADMIN_INGENIERIA, seccionId, profesorId)
    expect(seccion).toEqual({
      id: seccionId,
      numero: 1,
      horario: null,
      profesor: 'Profesor Norte',
      profesorId,
      ayudantes: [],
      alumnos: 0,
    })

    const curso = await detalle(ADMIN_INGENIERIA, await idCurso('ICC101'))
    expect(curso.secciones.map((s) => [s.numero, s.profesor])).toEqual([
      [1, 'Profesor Norte'],
      [2, null],
    ])
    // El Director también lo ve, en solo lectura.
    const delDirector = await detalle(DIRECTOR, await idCurso('ICC101'))
    expect(delDirector.secciones[0].profesor).toBe('Profesor Norte')
  })

  it('reasignar reemplaza al anterior: la sección queda con un solo profesor', async () => {
    const seccionId = await idSeccion('ICC201', 1)
    const [primero, segundo] = await profesoresEnBase('norte.cursus.test')

    await asignar(ADMIN_INGENIERIA, seccionId, primero.id)
    const seccion = await asignar(ADMIN_INGENIERIA, seccionId, segundo.id)

    expect(seccion.profesor).toBe(segundo.nombre)
    expect(await profesorDe(seccionId)).toBe(segundo.id)
  })

  it('la respuesta conserva la cantidad de alumnos inscritos (GES-15)', async () => {
    const seccionId = await idSeccion('ICC201', 2)
    await bd.query(
      `INSERT INTO inscripcion (universidad_id, seccion_id, usuario_id)
       SELECT s.universidad_id, s.id, u.id FROM seccion s, usuario u
        WHERE s.id = $1 AND u.correo = $2`,
      [seccionId, ALUMNO_NORTE],
    )

    const seccion = await asignar(
      ADMIN_INGENIERIA,
      seccionId,
      await idUsuario(PROFESOR_NORTE),
    )
    expect(seccion.alumnos).toBe(1)
  })

  it('acepta un profesor de otra facultad de su universidad', async () => {
    const seccionId = await idSeccion('ICO101', 1)
    // Profesor Norte es de Ingeniería; la sección, de Economía.
    const seccion = await asignar(
      ADMIN_ECONOMIA,
      seccionId,
      await idUsuario(PROFESOR_NORTE),
    )
    expect(seccion.profesor).toBe('Profesor Norte')
  })

  it.each([
    ['un profesor de otra universidad', PROFESOR_SUR],
    ['un usuario que no es profesor', ALUMNO_NORTE],
  ])('responde 404 con %s y no cambia nada', async (_caso, correo) => {
    const seccionId = await idSeccion('ICC101', 2)
    const respuesta = await asignar(
      ADMIN_INGENIERIA,
      seccionId,
      await idUsuario(correo),
      404,
    )
    expect(respuesta.message).toBe('La sección o el profesor no existen')
    expect(await profesorDe(seccionId)).toBeNull()
  })

  it('responde 404 con un profesor archivado', async () => {
    const seccionId = await idSeccion('ICC101', 2)
    const [, , archivado] = await profesoresEnBase('norte.cursus.test')
    await bd.query('UPDATE usuario SET archived_at = now() WHERE id = $1', [
      archivado.id,
    ])
    try {
      await asignar(ADMIN_INGENIERIA, seccionId, archivado.id, 404)
      expect(await profesorDe(seccionId)).toBeNull()
    } finally {
      await bd.query('UPDATE usuario SET archived_at = NULL WHERE id = $1', [
        archivado.id,
      ])
    }
  })

  it('responde 404 con una sección de otra facultad', async () => {
    const seccionId = await idSeccion('ICC101', 2)
    await asignar(
      ADMIN_ECONOMIA,
      seccionId,
      await idUsuario(PROFESOR_NORTE),
      404,
    )
    expect(await profesorDe(seccionId)).toBeNull()
  })

  it('responde 404 con una sección de otra universidad', async () => {
    const seccionId = await idSeccion('ENF101', 1)
    await asignar(
      ADMIN_INGENIERIA,
      seccionId,
      await idUsuario(PROFESOR_NORTE),
      404,
    )
    expect(await profesorDe(seccionId)).toBeNull()
  })

  it('responde 404 con una sección archivada o de un curso archivado', async () => {
    const profesorId = await idUsuario(PROFESOR_NORTE)
    const seccionId = await idSeccion('ICO201', 2)
    await bd.query('UPDATE seccion SET archived_at = now() WHERE id = $1', [
      seccionId,
    ])
    await asignar(ADMIN_ECONOMIA, seccionId, profesorId, 404)

    const cursoId = await idCurso('ICO201')
    const otraSeccion = await idSeccion('ICO201', 1)
    await bd.query('UPDATE curso SET archived_at = now() WHERE id = $1', [
      cursoId,
    ])
    try {
      await asignar(ADMIN_ECONOMIA, otraSeccion, profesorId, 404)
      expect(await profesorDe(otraSeccion)).toBeNull()
    } finally {
      await bd.query('UPDATE curso SET archived_at = NULL WHERE id = $1', [
        cursoId,
      ])
    }
  })

  it('el Director recibe 403 y no se asigna nada', async () => {
    const seccionId = await idSeccion('ENF201', 1)
    await asignar(DIRECTOR, seccionId, await idUsuario(PROFESOR_SUR), 403)
    expect(await profesorDe(seccionId)).toBeNull()
  })
})

describe('restricción en la base de datos', () => {
  it('rechaza un profesor de otra universidad aunque no pase por la API', async () => {
    const seccionId = await idSeccion('ENF201', 2)
    const profesorNorte = await idUsuario(PROFESOR_NORTE)

    const error: unknown = await bd
      .query<unknown>('UPDATE seccion SET profesor_id = $1 WHERE id = $2', [
        profesorNorte,
        seccionId,
      ])
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(QueryFailedError)
    expect((error as QueryFailedError).driverError).toMatchObject({
      code: '23503',
      constraint: 'fk_seccion_profesor',
    })
    expect(await profesorDe(seccionId)).toBeNull()
  })
})
