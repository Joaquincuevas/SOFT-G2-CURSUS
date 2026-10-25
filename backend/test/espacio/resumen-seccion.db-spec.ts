import type { Rol, SeccionResumen } from '@cursus/shared'
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

// ESP-04: base propia con el seed cargado, que se crea y se borra en cada
// ejecución. Todos los usuarios del seed (incluidos los de demo) comparten la
// contraseña.
const BD_TEST = `${process.env.POSTGRES_TEST_DB ?? 'cursus_test'}_resumen_seccion`
const PASSWORD = 'contraseña-de-prueba'
const BD_ORIGINAL = process.env.POSTGRES_DB

const PROFESOR = 'profesor@norte.cursus.test'
const AYUDANTE = 'ayudante@norte.cursus.test'
const ALUMNO = 'alumno@norte.cursus.test'
const ADMIN_INGENIERIA = 'administrativo.ingenieria@norte.cursus.test'
const ADMIN_ECONOMIA = 'administrativo.economia@norte.cursus.test'
const DIRECTOR_SUR = 'director@sur.cursus.test'

let admin: DataSource
let bd: DataSource
let app: INestApplication<App>
const tokens = new Map<string, string>()

// Usuarios de demo de Ingeniería Norte, distintos de los base.
const demo = {
  profesorOtraSeccion: '',
  ayudante: '',
  ayudanteArchivado: '',
  alumnoNoInscrito: '',
}
const secciones = { s1: '', s2: '' }

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
async function resumen(correo: string, seccionId: string, estado: number) {
  const token = await tokenDe(correo)
  const respuesta = await request(app.getHttpServer())
    .get(`/api/espacio/secciones/${seccionId}/resumen`)
    .set('Authorization', `Bearer ${token}`)
    .expect(estado)
  return respuesta.body as SeccionResumen
}

const usuarioDe = async (correo: string) =>
  (
    await bd.query<{ id: string; nombre: string }[]>(
      'SELECT id, nombre FROM usuario WHERE correo = $1',
      [correo],
    )
  )[0]

const seccionDe = async (codigo: string, numero: number) =>
  (
    await bd.query<{ id: string }[]>(
      `SELECT s.id FROM seccion s JOIN curso c ON c.id = s.curso_id
        WHERE c.codigo = $1 AND s.numero = $2`,
      [codigo, numero],
    )
  )[0].id

// Correo de un usuario de demo de Ingeniería Norte con ese rol (el n-ésimo).
async function demoDe(rol: Rol, n: number) {
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

const bloque = (
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
    [secciones.s1, dia, inicio, termino, sala],
  )

// Escenario, armado como dueño de las tablas (sin RLS):
// - ICC101 sección 1 (Ingeniería Norte): profesor, dos ayudantes activos y
//   uno archivado, el alumno base inscrito, y dos bloques de horario activos
//   (desordenados) y uno archivado.
// - ICC101 sección 2: otro profesor y ningún ayudante.
async function armarEscenario() {
  secciones.s1 = await seccionDe('ICC101', 1)
  secciones.s2 = await seccionDe('ICC101', 2)
  demo.profesorOtraSeccion = await demoDe('PROFESOR', 0)
  demo.ayudante = await demoDe('AYUDANTE', 0)
  demo.ayudanteArchivado = await demoDe('AYUDANTE', 1)
  demo.alumnoNoInscrito = await demoDe('ALUMNO', 0)

  const asignarProfesor = async (seccionId: string, correo: string) =>
    bd.query<unknown>('UPDATE seccion SET profesor_id = $2 WHERE id = $1', [
      seccionId,
      (await usuarioDe(correo)).id,
    ])
  await asignarProfesor(secciones.s1, PROFESOR)
  await asignarProfesor(secciones.s2, demo.profesorOtraSeccion)

  const asignarAyudante = async (correo: string, archivada: boolean) =>
    bd.query<unknown>(
      `INSERT INTO ayudante_seccion (universidad_id, seccion_id, usuario_id, archived_at)
       SELECT universidad_id, $1, $2, ${archivada ? 'now()' : 'NULL'}
         FROM seccion WHERE id = $1`,
      [secciones.s1, (await usuarioDe(correo)).id],
    )
  await asignarAyudante(AYUDANTE, false)
  await asignarAyudante(demo.ayudante, false)
  await asignarAyudante(demo.ayudanteArchivado, true)

  await bd.query(
    `INSERT INTO inscripcion (universidad_id, seccion_id, usuario_id)
     SELECT universidad_id, $1, $2 FROM seccion WHERE id = $1`,
    [secciones.s1, (await usuarioDe(ALUMNO)).id],
  )

  await bloque(3, '10:00', '11:30', 'Sala B-202')
  await bloque(1, '08:30', '10:00', 'Sala A-101')
  await bloque(5, '08:30', '10:00', 'Sala Z-999', true)
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

describe('GET /api/espacio/secciones/:id/resumen (ESP-04)', () => {
  it('trae curso, sección, horario con sala, profesor y ayudantes activos', async () => {
    const seccion = await resumen(ALUMNO, secciones.s1, 200)

    // Los ayudantes van por nombre; no aparece el de la asignación archivada.
    const ayudantes = [
      await usuarioDe(AYUDANTE),
      await usuarioDe(demo.ayudante),
    ].sort((a, b) => a.nombre.localeCompare(b.nombre))
    expect(seccion).toEqual({
      id: secciones.s1,
      numero: 1,
      curso: {
        id: expect.any(String) as string,
        codigo: 'ICC101',
        nombre: 'Introducción a la Programación',
      },
      periodo: expect.objectContaining({
        id: expect.any(String) as string,
      }) as SeccionResumen['periodo'],
      rol: 'ALUMNO',
      // Sin el bloque archivado, por día y hora.
      horario: [
        { dia: 1, inicio: '08:30', termino: '10:00', sala: 'Sala A-101' },
        { dia: 3, inicio: '10:00', termino: '11:30', sala: 'Sala B-202' },
      ],
      profesor: await usuarioDe(PROFESOR),
      ayudantes,
    } satisfies SeccionResumen)
  })

  it.each([
    [PROFESOR, 'PROFESOR'],
    [AYUDANTE, 'AYUDANTE'],
    [ALUMNO, 'ALUMNO'],
  ] as const)(
    '%s, integrante de la sección, recibe 200 con su rol',
    async (correo, rol) => {
      const seccion = await resumen(correo, secciones.s1, 200)
      expect(seccion.rol).toBe(rol)
      expect(seccion.ayudantes).toHaveLength(2)
    },
  )

  it('un alumno no inscrito recibe 403', async () => {
    await resumen(demo.alumnoNoInscrito, secciones.s1, 403)
  })

  it('el profesor de otra sección recibe 403', async () => {
    await resumen(demo.profesorOtraSeccion, secciones.s1, 403)
  })

  it('el Administrativo de la facultad del curso recibe 200', async () => {
    const seccion = await resumen(ADMIN_INGENIERIA, secciones.s1, 200)
    expect(seccion.rol).toBe('ADMINISTRATIVO')
    expect(seccion.profesor).toEqual(await usuarioDe(PROFESOR))
  })

  it('un Administrativo de otra facultad recibe 403', async () => {
    await resumen(ADMIN_ECONOMIA, secciones.s1, 403)
  })

  it('un Director de otra universidad recibe 200', async () => {
    const seccion = await resumen(DIRECTOR_SUR, secciones.s1, 200)
    expect(seccion.rol).toBe('DIRECTOR')
    expect(seccion.horario).toHaveLength(2)
    expect(seccion.profesor).toEqual(await usuarioDe(PROFESOR))
    expect(seccion.ayudantes).toHaveLength(2)
  })

  it('una sección sin ayudantes devuelve ayudantes []', async () => {
    const seccion = await resumen(demo.profesorOtraSeccion, secciones.s2, 200)
    expect(seccion).toMatchObject({
      numero: 2,
      rol: 'PROFESOR',
      horario: [],
      ayudantes: [],
    })
  })

  it('responde 401 sin sesión', async () => {
    await request(app.getHttpServer())
      .get(`/api/espacio/secciones/${secciones.s1}/resumen`)
      .expect(401)
  })
})
