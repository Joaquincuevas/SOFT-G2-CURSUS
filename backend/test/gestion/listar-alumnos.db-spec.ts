import type { AlumnosSeccion } from '@cursus/shared'
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

// Base propia con el seed cargado (cursos con las secciones 1 y 2), que se
// crea y se borra en cada ejecución (GES-18).
const BD_TEST = `${process.env.POSTGRES_TEST_DB ?? 'cursus_test'}_lista_alumnos`
const PASSWORD = 'contraseña-de-prueba'
// Hash con formato válido; estos alumnos no inician sesión.
const HASH = '$2b$10$abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOP'
const BD_ORIGINAL = process.env.POSTGRES_DB

// Usuarios del seed.
const ADMIN_INGENIERIA = 'administrativo.ingenieria@norte.cursus.test'
const ADMIN_ECONOMIA = 'administrativo.economia@norte.cursus.test'
const ADMIN_SUR = 'administrativo@sur.cursus.test'
const DIRECTOR = 'director@norte.cursus.test'
const PROFESOR = 'profesor@norte.cursus.test'
const DIRECTOR_SUR = 'director@sur.cursus.test'

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
async function alumnos(correo: string, seccionId: string, estado = 200) {
  const token = await tokenDe(correo)
  const respuesta = await request(app.getHttpServer())
    .get(`/api/secciones/${seccionId}/alumnos`)
    .set('Authorization', `Bearer ${token}`)
    .expect(estado)
  return respuesta.body as AlumnosSeccion
}

// Sección del seed por código de curso y número.
const seccionDe = async (codigo: string, numero = 1) =>
  (
    await bd.query<{ id: string }[]>(
      `SELECT s.id FROM seccion s JOIN curso c ON c.id = s.curso_id
        WHERE c.codigo = $1 AND s.numero = $2`,
      [codigo, numero],
    )
  )[0].id

// Crea alumnos de Norte (como dueño de las tablas) y los inscribe en la
// sección. Devuelve los ids de las inscripciones.
async function inscribir(seccionId: string, nombres: string[]) {
  const ids: string[] = []
  for (const nombre of nombres) {
    const correo = `${nombre
      .normalize('NFD')
      .replace(/[^a-zA-Z]/g, '')
      .toLowerCase()}.${ids.length}.${seccionId.slice(0, 8)}@norte.cursus.test`
    const [{ id }] = await bd.query<{ id: string }[]>(
      `WITH alumno AS (
         INSERT INTO usuario (universidad_id, facultad_id, nombre, correo, password_hash, rol)
         SELECT s.universidad_id, ca.facultad_id, $2, $3, $4, 'ALUMNO'
           FROM seccion s JOIN curso c ON c.id = s.curso_id
           JOIN carrera ca ON ca.id = c.carrera_id
          WHERE s.id = $1
         RETURNING id, universidad_id
       )
       INSERT INTO inscripcion (universidad_id, seccion_id, usuario_id)
       SELECT universidad_id, $1, id FROM alumno RETURNING id`,
      [seccionId, nombre, correo, HASH],
    )
    ids.push(id)
  }
  return ids
}

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

describe('GET /api/secciones/:id/alumnos', () => {
  it('lista los alumnos en orden alfabético en español, con el total', async () => {
    const seccion = await seccionDe('ICC101')
    await inscribir(seccion, [
      'Zoe Ruiz',
      'Ñandú Pérez',
      'Óscar Díaz',
      'andrés Soto',
      'Nadia León',
      'Ángela Mora',
      'Oscar Vera',
    ])

    const respuesta = await alumnos(ADMIN_INGENIERIA, seccion)
    expect(respuesta.seccion).toEqual({
      id: seccion,
      numero: 1,
      curso: {
        id: expect.any(String) as string,
        codigo: 'ICC101',
        nombre: 'Introducción a la Programación',
      },
    })
    // La ñ va después de la n, y las tildes y mayúsculas no cambian el orden.
    expect(respuesta.alumnos.map((a) => a.nombre)).toEqual([
      'andrés Soto',
      'Ángela Mora',
      'Nadia León',
      'Ñandú Pérez',
      'Óscar Díaz',
      'Oscar Vera',
      'Zoe Ruiz',
    ])
    expect(respuesta.alumnos[0]).toEqual({
      id: expect.any(String) as string,
      nombre: 'andrés Soto',
      correo: expect.stringMatching(/@norte\.cursus\.test$/) as string,
    })
    expect(respuesta.total).toBe(7)
  })

  it('con el mismo nombre, ordena por correo', async () => {
    const seccion = await seccionDe('ICC201')
    await inscribir(seccion, ['Ana Rojas', 'Ana Rojas'])
    const { alumnos: lista } = await alumnos(ADMIN_INGENIERIA, seccion)
    expect(lista.map((a) => a.correo)).toEqual(
      lista.map((a) => a.correo).sort(),
    )
  })

  it('una sección sin alumnos devuelve la lista vacía', async () => {
    const respuesta = await alumnos(
      ADMIN_INGENIERIA,
      await seccionDe('ICC101', 2),
    )
    expect(respuesta).toMatchObject({ alumnos: [], total: 0 })
  })

  it('no muestra las inscripciones archivadas', async () => {
    const seccion = await seccionDe('ICC201', 2)
    const [archivada] = await inscribir(seccion, [
      'Bruno Archivado',
      'Carla Activa',
    ])
    await bd.query(
      'UPDATE inscripcion SET archived_at = now(), archivada_por = usuario_id WHERE id = $1',
      [archivada],
    )
    const respuesta = await alumnos(ADMIN_INGENIERIA, seccion)
    expect(respuesta.alumnos.map((a) => a.nombre)).toEqual(['Carla Activa'])
    expect(respuesta.total).toBe(1)
  })

  it('responde 404 con una sección de otra universidad', async () => {
    await alumnos(ADMIN_SUR, await seccionDe('ICC101'), 404)
  })

  it('responde 404 con una sección de otra facultad', async () => {
    await alumnos(ADMIN_ECONOMIA, await seccionDe('ICC101'), 404)
  })

  it('responde 404 con una sección archivada', async () => {
    const seccion = await seccionDe('ICO101')
    await bd.query('UPDATE seccion SET archived_at = now() WHERE id = $1', [
      seccion,
    ])
    await alumnos(ADMIN_ECONOMIA, seccion, 404)
  })

  it('responde 400 con un id que no es uuid', async () => {
    await alumnos(ADMIN_INGENIERIA, 'no-es-uuid', 400)
  })

  it('el Director ve las secciones de su universidad, de cualquier facultad', async () => {
    const respuesta = await alumnos(DIRECTOR, await seccionDe('ICO201'))
    expect(respuesta.seccion.curso.codigo).toBe('ICO201')
  })

  it('el Director de otra universidad recibe 404', async () => {
    await alumnos(DIRECTOR_SUR, await seccionDe('ICC101'), 404)
  })

  it('el Profesor recibe 403', async () => {
    await alumnos(PROFESOR, await seccionDe('ICC101'), 403)
  })
})
