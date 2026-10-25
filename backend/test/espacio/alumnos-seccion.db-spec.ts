import type { AlumnosEspacio } from '@cursus/shared'
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

// ESP-05: base propia con el seed cargado, que se crea y se borra en cada
// ejecución. Todos los usuarios del seed comparten la contraseña.
const BD_TEST = `${process.env.POSTGRES_TEST_DB ?? 'cursus_test'}_alumnos_espacio`
const PASSWORD = 'contraseña-de-prueba'
// Hash con formato válido; los alumnos creados aquí no inician sesión.
const HASH = '$2b$10$abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOP'
const BD_ORIGINAL = process.env.POSTGRES_DB

const PROFESOR = 'profesor@norte.cursus.test'
const AYUDANTE = 'ayudante@norte.cursus.test'
const ALUMNO = 'alumno@norte.cursus.test'
const ADMIN_INGENIERIA = 'administrativo.ingenieria@norte.cursus.test'
const DIRECTOR = 'director@norte.cursus.test'
const PROFESOR_SUR = 'profesor@sur.cursus.test'

let admin: DataSource
let bd: DataSource
let app: INestApplication<App>
const tokens = new Map<string, string>()

const secciones = { s1: '', s2: '' }
let profesorOtraSeccion = ''

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
async function alumnos(correo: string, seccionId: string, estado: number) {
  const token = await tokenDe(correo)
  const respuesta = await request(app.getHttpServer())
    .get(`/api/espacio/secciones/${seccionId}/alumnos`)
    .set('Authorization', `Bearer ${token}`)
    .expect(estado)
  return respuesta.body as AlumnosEspacio
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

// Inscribe en la sección a un usuario existente; con `archivadaPor`, la
// inscripción queda archivada.
const inscribir = (
  seccionId: string,
  usuarioId: string,
  archivadaPor: string | null = null,
) =>
  bd.query(
    `INSERT INTO inscripcion (universidad_id, seccion_id, usuario_id, archived_at, archivada_por)
     SELECT universidad_id, $1, $2,
            CASE WHEN $3::uuid IS NULL THEN NULL ELSE now() END, $3
       FROM seccion WHERE id = $1`,
    [seccionId, usuarioId, archivadaPor],
  )

// Crea un alumno de la universidad de la sección y devuelve su id.
async function crearAlumno(seccionId: string, nombre: string) {
  const correo = `${nombre
    .normalize('NFD')
    .replace(/[^a-zA-Z]/g, '')
    .toLowerCase()}@norte.cursus.test`
  const [{ id }] = await bd.query<{ id: string }[]>(
    `INSERT INTO usuario (universidad_id, nombre, correo, password_hash, rol)
     SELECT universidad_id, $2, $3, $4, 'ALUMNO' FROM seccion WHERE id = $1
     RETURNING id`,
    [seccionId, nombre, correo, HASH],
  )
  return id
}

// Escenario, armado como dueño de las tablas (sin RLS):
// - ICC101 sección 1: profesor y ayudante base; el alumno base y cinco
//   alumnos más inscritos (con tildes, ñ y una minúscula inicial), y uno con
//   la inscripción archivada.
// - ICC101 sección 2: otro profesor y ningún alumno.
async function armarEscenario() {
  secciones.s1 = await seccionDe('ICC101', 1)
  secciones.s2 = await seccionDe('ICC101', 2)
  const [{ correo }] = await bd.query<{ correo: string }[]>(
    `SELECT u.correo FROM usuario u JOIN universidad un ON un.id = u.universidad_id
      WHERE u.rol = 'PROFESOR' AND un.dominio_correo = 'norte.cursus.test'
        AND u.correo <> $1 ORDER BY u.correo LIMIT 1`,
    [PROFESOR],
  )
  profesorOtraSeccion = correo

  await bd.query('UPDATE seccion SET profesor_id = $2 WHERE id = $1', [
    secciones.s1,
    await idDe(PROFESOR),
  ])
  await bd.query('UPDATE seccion SET profesor_id = $2 WHERE id = $1', [
    secciones.s2,
    await idDe(profesorOtraSeccion),
  ])
  await bd.query(
    `INSERT INTO ayudante_seccion (universidad_id, seccion_id, usuario_id)
     SELECT universidad_id, $1, $2 FROM seccion WHERE id = $1`,
    [secciones.s1, await idDe(AYUDANTE)],
  )

  await inscribir(secciones.s1, await idDe(ALUMNO))
  for (const nombre of [
    'Zoe Ruiz',
    'Ñandú Pérez',
    'Óscar Díaz',
    'andrés Soto',
    'Ángela Mora',
  ]) {
    await inscribir(secciones.s1, await crearAlumno(secciones.s1, nombre))
  }
  // Primero en orden alfabético, para que se note si apareciera.
  await inscribir(
    secciones.s1,
    await crearAlumno(secciones.s1, 'Aaron Archivado'),
    await idDe(ADMIN_INGENIERIA),
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

describe('GET /api/espacio/secciones/:id/alumnos (ESP-05)', () => {
  it('el profesor recibe nombre y correo en orden alfabético en español, con el total', async () => {
    const respuesta = await alumnos(PROFESOR, secciones.s1, 200)

    expect(Object.keys(respuesta).sort()).toEqual(['alumnos', 'total'])
    expect(respuesta.total).toBe(6)
    expect(respuesta.alumnos.map((a) => a.nombre)).toEqual([
      'Alumno Norte',
      'andrés Soto',
      'Ángela Mora',
      'Ñandú Pérez',
      'Óscar Díaz',
      'Zoe Ruiz',
    ])
    expect(respuesta.alumnos[0]).toEqual({
      id: await idDe(ALUMNO),
      nombre: 'Alumno Norte',
      correo: ALUMNO,
    })
  })

  it('las inscripciones archivadas no aparecen ni cuentan en el total', async () => {
    const respuesta = await alumnos(PROFESOR, secciones.s1, 200)

    expect(respuesta.alumnos.map((a) => a.nombre)).not.toContain(
      'Aaron Archivado',
    )
    expect(respuesta.total).toBe(respuesta.alumnos.length)
  })

  it('una sección sin alumnos devuelve la lista vacía', async () => {
    expect(await alumnos(profesorOtraSeccion, secciones.s2, 200)).toEqual({
      total: 0,
      alumnos: [],
    })
  })

  describe('integrantes que no son el profesor: 403', () => {
    it.each([
      [
        'un alumno inscrito (no ve los correos de sus compañeros, RE-10)',
        ALUMNO,
      ],
      ['un ayudante de la sección', AYUDANTE],
      [
        'el Administrativo de la facultad (tiene la lista de gestión, GES-18)',
        ADMIN_INGENIERIA,
      ],
      ['el Director', DIRECTOR],
    ])('%s', async (_caso, correo) => {
      await alumnos(correo, secciones.s1, 403)
    })
  })

  it('un profesor de otra sección de la misma universidad recibe 403', async () => {
    // 403 del guard de ESP-06 (IntegranteSeccionGuard): no es integrante.
    await alumnos(profesorOtraSeccion, secciones.s1, 403)
  })

  it('un profesor de otra universidad recibe 404 y no ve nada', async () => {
    // 404 del guard de ESP-06: la consulta del guard pasa por RLS con la
    // universidad de la sesión, así que la sección de otra universidad no
    // existe para él. No es una regla nueva de ESP-05.
    const respuesta = await alumnos(PROFESOR_SUR, secciones.s1, 404)
    expect(respuesta).not.toHaveProperty('alumnos')
  })
})
