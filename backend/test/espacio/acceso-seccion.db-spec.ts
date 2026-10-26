import type { SeccionEspacio } from '@cursus/shared'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { DataSource } from 'typeorm'
import { vi } from 'vitest'
import { AppModule } from '../../src/app.module.js'
import type { RespuestaLogin } from '../../src/auth/auth.controller.js'
import { configurarApp } from '../../src/config/configurar-app.js'
import { BaseDeDatos } from '../../src/database/base-de-datos.service.js'
import { opcionesDataSource } from '../../src/database/data-source.js'
import { ejecutarSeed } from '../../src/database/seed.js'

// ESP-06: base propia con el seed cargado, que se crea y se borra en cada
// ejecución. Todos los usuarios del seed (incluidos los de demo) comparten la
// contraseña.
const BD_TEST = `${process.env.POSTGRES_TEST_DB ?? 'cursus_test'}_acceso_seccion`
const PASSWORD = 'contraseña-de-prueba'
const BD_ORIGINAL = process.env.POSTGRES_DB

const PROFESOR = 'profesor@norte.cursus.test'
const AYUDANTE = 'ayudante@norte.cursus.test'
const ALUMNO = 'alumno@norte.cursus.test'
const ADMIN_INGENIERIA = 'administrativo.ingenieria@norte.cursus.test'
const ADMIN_ECONOMIA = 'administrativo.economia@norte.cursus.test'
const ADMIN_SUR = 'administrativo@sur.cursus.test'
const PROFESOR_SUR = 'profesor@sur.cursus.test'
const DIRECTOR = 'director@norte.cursus.test'
const DIRECTOR_SUR = 'director@sur.cursus.test'
const NO_EXISTE = '00000000-0000-4000-8000-000000000000'

let admin: DataSource
let bd: DataSource
let app: INestApplication<App>
const tokens = new Map<string, string>()

// Usuarios de demo de Ingeniería Norte, distintos de los base.
const demo: Record<
  | 'profesorOtraSeccion'
  | 'ayudanteArchivado'
  | 'alumnoNoInscrito'
  | 'alumnoArchivado',
  string
> = {
  profesorOtraSeccion: '',
  ayudanteArchivado: '',
  alumnoNoInscrito: '',
  alumnoArchivado: '',
}
const secciones = { s1: '', s2: '', archivada: '', cursoArchivado: '' }

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
async function espacio(correo: string, seccionId: string, estado: number) {
  const token = await tokenDe(correo)
  const respuesta = await request(app.getHttpServer())
    .get(`/api/espacio/secciones/${seccionId}`)
    .set('Authorization', `Bearer ${token}`)
    .expect(estado)
  return respuesta.body as SeccionEspacio
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

// Correo de un usuario de demo de Ingeniería Norte con ese rol (el n-ésimo).
async function demoDe(rol: string, n: number) {
  const filas = await bd.query<{ correo: string }[]>(
    `SELECT u.correo FROM usuario u
       JOIN facultad f ON f.id = u.facultad_id
       JOIN universidad un ON un.id = u.universidad_id
      WHERE u.rol = $1 AND f.nombre = 'Facultad de Ingeniería'
        AND un.dominio_correo = 'norte.cursus.test'
        AND u.correo NOT IN ($2, $3, $4)
      ORDER BY u.correo`,
    [rol, PROFESOR, AYUDANTE, ALUMNO],
  )
  return filas[n].correo
}

// Escenario, armado como dueño de las tablas (sin RLS):
// - ICC101 sección 1: profesor, ayudante y alumno base; un ayudante y un
//   alumno con su asignación/inscripción archivada.
// - ICC101 sección 2: otro profesor.
// - ICC101 sección 3 archivada, y la sección 1 de ICC201 con su curso
//   archivado, ambas con el profesor base asignado.
async function armarEscenario() {
  secciones.s1 = await seccionDe('ICC101', 1)
  secciones.s2 = await seccionDe('ICC101', 2)
  secciones.cursoArchivado = await seccionDe('ICC201', 1)
  demo.profesorOtraSeccion = await demoDe('PROFESOR', 0)
  demo.ayudanteArchivado = await demoDe('AYUDANTE', 0)
  demo.alumnoNoInscrito = await demoDe('ALUMNO', 0)
  demo.alumnoArchivado = await demoDe('ALUMNO', 1)
  const responsable = await idDe(ADMIN_INGENIERIA)

  const [{ id: archivada }] = await bd.query<{ id: string }[]>(
    `INSERT INTO seccion (universidad_id, curso_id, numero, archived_at, profesor_id)
     SELECT universidad_id, curso_id, 3, now(), $2 FROM seccion WHERE id = $1
     RETURNING id`,
    [secciones.s1, await idDe(PROFESOR)],
  )
  secciones.archivada = archivada

  await bd.query('UPDATE seccion SET profesor_id = $2 WHERE id = $1', [
    secciones.s1,
    await idDe(PROFESOR),
  ])
  await bd.query('UPDATE seccion SET profesor_id = $2 WHERE id = $1', [
    secciones.s2,
    await idDe(demo.profesorOtraSeccion),
  ])
  await bd.query('UPDATE seccion SET profesor_id = $2 WHERE id = $1', [
    secciones.cursoArchivado,
    await idDe(PROFESOR),
  ])
  await bd.query(
    `UPDATE curso SET archived_at = now()
      WHERE id = (SELECT curso_id FROM seccion WHERE id = $1)`,
    [secciones.cursoArchivado],
  )

  const asignar = (usuario: string, archivada: boolean) =>
    bd.query(
      `INSERT INTO ayudante_seccion (universidad_id, seccion_id, usuario_id, archived_at)
       SELECT universidad_id, $1, $2, ${archivada ? 'now()' : 'NULL'}
         FROM seccion WHERE id = $1`,
      [secciones.s1, usuario],
    )
  await asignar(await idDe(AYUDANTE), false)
  await asignar(await idDe(demo.ayudanteArchivado), true)

  const inscribir = (usuario: string, archivadaPor: string | null) =>
    bd.query(
      `INSERT INTO inscripcion (universidad_id, seccion_id, usuario_id, archived_at, archivada_por)
       SELECT universidad_id, $1, $2,
              CASE WHEN $3::uuid IS NULL THEN NULL ELSE now() END, $3
         FROM seccion WHERE id = $1`,
      [secciones.s1, usuario, archivadaPor],
    )
  await inscribir(await idDe(ALUMNO), null)
  await inscribir(await idDe(demo.alumnoArchivado), responsable)
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

describe('GET /api/espacio/secciones/:id (ESP-06)', () => {
  describe('casos de la tarjeta', () => {
    it('un alumno inscrito accede, con su rol en la sección', async () => {
      const seccion = await espacio(ALUMNO, secciones.s1, 200)

      const [periodo] = await bd.query<
        { id: string; anio: number; semestre: number }[]
      >(
        `SELECT p.id, p.anio, p.semestre FROM periodo p
           JOIN curso c ON c.periodo_id = p.id
           JOIN seccion s ON s.curso_id = c.id
          WHERE s.id = $1`,
        [secciones.s1],
      )
      expect(seccion).toEqual({
        id: secciones.s1,
        numero: 1,
        curso: {
          id: expect.any(String) as string,
          codigo: 'ICC101',
          nombre: 'Introducción a la Programación',
        },
        periodo,
        rol: 'ALUMNO',
      } satisfies SeccionEspacio)
    })

    it('un alumno no inscrito de la misma universidad recibe 403', async () => {
      await espacio(demo.alumnoNoInscrito, secciones.s1, 403)
    })

    it('un profesor de otra sección recibe 403', async () => {
      await espacio(demo.profesorOtraSeccion, secciones.s1, 403)
    })
  })

  describe('integrantes', () => {
    it.each([
      ['el profesor a cargo', PROFESOR, 'PROFESOR'],
      ['un ayudante asignado', AYUDANTE, 'AYUDANTE'],
      [
        'el Administrativo de la facultad del curso',
        ADMIN_INGENIERIA,
        'ADMINISTRATIVO',
      ],
    ])('%s accede', async (_caso, correo, rol) => {
      expect((await espacio(correo, secciones.s1, 200)).rol).toBe(rol)
    })

    it('el profesor de la otra sección sí entra a la suya', async () => {
      expect(
        (await espacio(demo.profesorOtraSeccion, secciones.s2, 200)).rol,
      ).toBe('PROFESOR')
    })
  })

  describe('usuarios de la misma universidad que no son integrantes: 403', () => {
    it.each([
      ['un ayudante con la asignación archivada', () => demo.ayudanteArchivado],
      ['un alumno con la inscripción archivada', () => demo.alumnoArchivado],
      ['un alumno inscrito en otra sección', () => ALUMNO, () => secciones.s2],
      ['un ayudante de otra sección', () => AYUDANTE, () => secciones.s2],
      ['el Administrativo de otra facultad', () => ADMIN_ECONOMIA],
    ])('%s', async (_caso, correo, seccion = () => secciones.s1) => {
      await espacio(correo(), seccion(), 403)
    })
  })

  describe('404: desde fuera no se distingue si existe', () => {
    it.each([
      ['un profesor de otra universidad', PROFESOR_SUR, () => secciones.s1],
      ['un Administrativo de otra universidad', ADMIN_SUR, () => secciones.s1],
      ['una sección que no existe', PROFESOR, () => NO_EXISTE],
      [
        'una sección archivada, aunque sea su profesor',
        PROFESOR,
        () => secciones.archivada,
      ],
      [
        'una sección de un curso archivado',
        PROFESOR,
        () => secciones.cursoArchivado,
      ],
    ])('%s', async (_caso, correo, seccion) => {
      await espacio(correo, seccion(), 404)
    })

    it('el Director tampoco ve una sección archivada', async () => {
      await espacio(DIRECTOR, secciones.archivada, 404)
    })
  })

  describe('Director: lee cualquier sección en una transacción de solo lectura', () => {
    interface Transaccion {
      consultas: string[]
      soloLectura: boolean
    }
    let transacciones: Transaccion[]

    // Envuelve BaseDeDatos.enTransaccion: al final de cada transacción
    // pregunta a PostgreSQL si es de solo lectura, y anota sus consultas.
    beforeEach(() => {
      transacciones = []
      const bdApp = app.get(BaseDeDatos)
      const original = bdApp.enTransaccion.bind(bdApp)
      vi.spyOn(bdApp, 'enTransaccion').mockImplementation((tarea) =>
        original(async (tx) => {
          const consultas: string[] = []
          const resultado = await tarea({
            query: <T>(sql: string, parametros?: unknown[]) => {
              consultas.push(sql)
              return tx.query<T>(sql, parametros)
            },
          })
          const [{ transaction_read_only }] = await tx.query<{
            transaction_read_only: string
          }>('SHOW transaction_read_only')
          transacciones.push({
            consultas,
            soloLectura: transaction_read_only === 'on',
          })
          return resultado
        }),
      )
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    // Transacciones de la petición que leyeron la sección.
    const deLaSeccion = () =>
      transacciones.filter((t) =>
        t.consultas.some((sql) => /FROM seccion s/.test(sql)),
      )

    it.each([
      ['de su universidad', DIRECTOR],
      ['de otra universidad', DIRECTOR_SUR],
    ])('sección %s: 200 y READ ONLY', async (_caso, correo) => {
      await tokenDe(correo)
      transacciones = []

      expect((await espacio(correo, secciones.s1, 200)).rol).toBe('DIRECTOR')

      expect(deLaSeccion()).toHaveLength(1)
      expect(deLaSeccion()[0].soloLectura).toBe(true)
    })

    it('la verificación distingue: un integrante lee sin READ ONLY', async () => {
      await tokenDe(PROFESOR)
      transacciones = []

      await espacio(PROFESOR, secciones.s1, 200)

      expect(deLaSeccion()).toHaveLength(1)
      expect(deLaSeccion()[0].soloLectura).toBe(false)
    })
  })
})
