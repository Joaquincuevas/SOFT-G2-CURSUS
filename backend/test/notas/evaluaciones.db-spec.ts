import type {
  CrearEvaluacion,
  Evaluacion,
  EvaluacionesSeccion,
  Rol,
} from '@cursus/shared'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { DataSource, type QueryRunner } from 'typeorm'
import { AppModule } from '../../src/app.module.js'
import type { RespuestaLogin } from '../../src/auth/auth.controller.js'
import { configurarApp } from '../../src/config/configurar-app.js'
import { ROL_APP } from '../../src/database/base-de-datos.service.js'
import { opcionesDataSource } from '../../src/database/data-source.js'
import { ejecutarSeed } from '../../src/database/seed.js'

// NOT-01: base propia con el seed cargado, que se crea y se borra en cada
// ejecución. Todos los usuarios del seed comparten la contraseña.
const BD_TEST = `${process.env.POSTGRES_TEST_DB ?? 'cursus_test'}_evaluaciones`
const PASSWORD = 'contraseña-de-prueba'
const BD_ORIGINAL = process.env.POSTGRES_DB

// Códigos de error de PostgreSQL.
const CHECK = '23514'
const SIN_PERMISO = '42501'

const PROFESOR = 'profesor@norte.cursus.test'
const AYUDANTE = 'ayudante@norte.cursus.test'
const ALUMNO = 'alumno@norte.cursus.test'
const ADMIN_INGENIERIA = 'administrativo.ingenieria@norte.cursus.test'
const DIRECTOR = 'director@norte.cursus.test'
const DIRECTOR_SUR = 'director@sur.cursus.test'
const PROFESOR_SUR = 'profesor@sur.cursus.test'

let admin: DataSource
let bd: DataSource
let app: INestApplication<App>
const tokens = new Map<string, string>()

const secciones = { s1: '', s2: '' }
let profesorOtraSeccion = ''
let alumnoNoInscrito = ''
// Período del curso de ICC101 (YYYY-MM-DD).
const periodo = { inicio: '', termino: '' }
// Una fecha dentro del período, desplazada n días desde su inicio.
const dentro = (dias: number) => {
  const fecha = new Date(`${periodo.inicio}T00:00:00Z`)
  fecha.setUTCDate(fecha.getUTCDate() + dias)
  return fecha.toISOString().slice(0, 10)
}

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
async function listar(correo: string, seccionId: string, estado: number) {
  const token = await tokenDe(correo)
  const respuesta = await request(app.getHttpServer())
    .get(`/api/espacio/secciones/${seccionId}/evaluaciones`)
    .set('Authorization', `Bearer ${token}`)
    .expect(estado)
  return respuesta.body as EvaluacionesSeccion
}

async function crear(
  correo: string,
  seccionId: string,
  datos: Partial<CrearEvaluacion> & Record<string, unknown>,
  estado: number,
) {
  const token = await tokenDe(correo)
  const respuesta = await request(app.getHttpServer())
    .post(`/api/espacio/secciones/${seccionId}/evaluaciones`)
    .set('Authorization', `Bearer ${token}`)
    .send(datos)
    .expect(estado)
  return respuesta.body as Evaluacion & { message?: string | string[] }
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

// Consulta con el rol de la API, en una transacción que se revierte.
async function comoApp(
  sesion: { universidadId: string; rol: Rol },
  prueba: (q: QueryRunner) => Promise<void>,
) {
  const q = bd.createQueryRunner()
  await q.startTransaction()
  try {
    await q.query(`SET LOCAL ROLE ${ROL_APP}`)
    await q.query(
      `SELECT set_config('app.universidad_id', $1, true),
              set_config('app.rol', $2, true)`,
      [sesion.universidadId, sesion.rol],
    )
    await prueba(q)
  } finally {
    await q.rollbackTransaction()
    await q.release()
  }
}

const universidadDe = async (dominio: string) =>
  (
    await bd.query<{ id: string }[]>(
      'SELECT id FROM universidad WHERE dominio_correo = $1',
      [dominio],
    )
  )[0].id

// Escenario, armado como dueño de las tablas (sin RLS): ICC101 sección 1
// con el profesor, el ayudante y el alumno base; ICC101 sección 2 con otro
// profesor.
async function armarEscenario() {
  secciones.s1 = await seccionDe('ICC101', 1)
  secciones.s2 = await seccionDe('ICC101', 2)
  const correosDe = (rol: Rol) =>
    bd.query<{ correo: string }[]>(
      `SELECT u.correo FROM usuario u JOIN universidad un ON un.id = u.universidad_id
        WHERE u.rol = $1 AND un.dominio_correo = 'norte.cursus.test'
          AND u.correo NOT IN ($2, $3, $4) ORDER BY u.correo LIMIT 1`,
      [rol, PROFESOR, AYUDANTE, ALUMNO],
    )
  profesorOtraSeccion = (await correosDe('PROFESOR'))[0].correo
  alumnoNoInscrito = (await correosDe('ALUMNO'))[0].correo

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
  await bd.query(
    `INSERT INTO inscripcion (universidad_id, seccion_id, usuario_id)
     SELECT universidad_id, $1, $2 FROM seccion WHERE id = $1`,
    [secciones.s1, await idDe(ALUMNO)],
  )

  const [rango] = await bd.query<{ inicio: string; termino: string }[]>(
    `SELECT to_char(p.fecha_inicio, 'YYYY-MM-DD') AS inicio,
            to_char(p.fecha_termino, 'YYYY-MM-DD') AS termino
       FROM seccion s JOIN curso c ON c.id = s.curso_id
       JOIN periodo p ON p.id = c.periodo_id WHERE s.id = $1`,
    [secciones.s1],
  )
  Object.assign(periodo, rango)
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

describe('POST /api/espacio/secciones/:id/evaluaciones (NOT-01)', () => {
  it('el profesor de la sección crea una evaluación y queda como creada_por', async () => {
    const creada = await crear(
      PROFESOR,
      secciones.s1,
      { nombre: '  Control   1 ', fecha: dentro(10), ponderacion: 20 },
      201,
    )

    expect(creada).toEqual({
      id: expect.any(String) as string,
      nombre: 'Control 1',
      fecha: dentro(10),
      ponderacion: 20,
    })
    const [fila] = await bd.query<{ creada_por: string; seccion_id: string }[]>(
      'SELECT creada_por, seccion_id FROM evaluacion WHERE id = $1',
      [creada.id],
    )
    expect(fila).toEqual({
      creada_por: await idDe(PROFESOR),
      seccion_id: secciones.s1,
    })
  })

  it('acepta los extremos de la ponderación (1 y 100) y las fechas límite del período', async () => {
    await crear(
      PROFESOR,
      secciones.s1,
      { nombre: 'Mínima', fecha: periodo.inicio, ponderacion: 1 },
      201,
    )
    await crear(
      PROFESOR,
      secciones.s1,
      { nombre: 'Máxima', fecha: periodo.termino, ponderacion: 100 },
      201,
    )
  })

  describe('validaciones: 400', () => {
    const valida = () => ({
      nombre: 'Solemne',
      fecha: dentro(20),
      ponderacion: 30,
    })

    it.each([
      ['sin nombre', { nombre: undefined }],
      ['sin fecha', { fecha: undefined }],
      ['sin ponderación', { ponderacion: undefined }],
      ['nombre vacío o solo espacios', { nombre: '   ' }],
      ['nombre de más de 100 caracteres', { nombre: 'x'.repeat(101) }],
      ['ponderación 0', { ponderacion: 0 }],
      ['ponderación 101', { ponderacion: 101 }],
      ['ponderación no entera', { ponderacion: 12.5 }],
      ['ponderación como texto', { ponderacion: '20' }],
      ['fecha con otro formato', { fecha: '15/09/2026' }],
      ['fecha inexistente', { fecha: '2026-02-30' }],
      ['un campo no esperado', { seccionId: secciones.s2 }],
      ['nombre con un carácter de control', { nombre: 'Control\u0000' }],
    ])('%s', async (_caso, cambio) => {
      await crear(PROFESOR, secciones.s1, { ...valida(), ...cambio }, 400)
    })

    it('fecha fuera del período del curso, con el rango en el mensaje', async () => {
      const antes = new Date(`${periodo.inicio}T00:00:00Z`)
      antes.setUTCDate(antes.getUTCDate() - 1)
      const respuesta = await crear(
        PROFESOR,
        secciones.s1,
        { ...valida(), fecha: antes.toISOString().slice(0, 10) },
        400,
      )
      expect(respuesta.message).toBe(
        `La fecha debe estar dentro del período del curso (del ${periodo.inicio} al ${periodo.termino})`,
      )
    })

    it('la base también rechaza una ponderación fuera de 1..100 (CHECK)', async () => {
      for (const ponderacion of [0, 101]) {
        await expect(
          bd.query(
            `INSERT INTO evaluacion (universidad_id, seccion_id, nombre, fecha, ponderacion, creada_por)
             SELECT universidad_id, id, 'Directo', $2::date, $3, $4 FROM seccion WHERE id = $1`,
            [secciones.s1, dentro(5), ponderacion, await idDe(PROFESOR)],
          ),
        ).rejects.toMatchObject({ driverError: { code: CHECK } })
      }
    })
  })

  describe('solo el profesor de la sección crea', () => {
    const datos = () => ({
      nombre: 'Intruso',
      fecha: dentro(3),
      ponderacion: 5,
    })

    it.each([
      ['un alumno inscrito', ALUMNO],
      ['un ayudante de la sección', AYUDANTE],
      ['el Administrativo de la facultad', ADMIN_INGENIERIA],
      ['el Director', DIRECTOR],
    ])('%s recibe 403', async (_caso, correo) => {
      await crear(correo, secciones.s1, datos(), 403)
    })

    it('un profesor de otra sección de la misma universidad recibe 403', async () => {
      // 403 del guard de ESP-06: no es integrante de la sección.
      await crear(profesorOtraSeccion, secciones.s1, datos(), 403)
    })

    it('un profesor de otra universidad recibe 404', async () => {
      // 404 del guard de ESP-06: con RLS, la sección no existe para él.
      await crear(PROFESOR_SUR, secciones.s1, datos(), 404)
    })

    it('ninguno de esos intentos guardó una evaluación', async () => {
      const [{ total }] = await bd.query<{ total: string }[]>(
        `SELECT count(*) AS total FROM evaluacion WHERE nombre = 'Intruso'`,
      )
      expect(Number(total)).toBe(0)
    })
  })
})

describe('GET /api/espacio/secciones/:id/evaluaciones (NOT-01)', () => {
  beforeAll(async () => {
    // Una evaluación archivada: no aparece ni suma.
    await bd.query(
      `INSERT INTO evaluacion (universidad_id, seccion_id, nombre, fecha, ponderacion, creada_por, archived_at)
       SELECT universidad_id, id, 'Archivada', $2::date, 50, $3, now() FROM seccion WHERE id = $1`,
      [secciones.s1, dentro(1), await idDe(PROFESOR)],
    )
  })

  it('lista las evaluaciones activas por fecha, con la suma de las ponderaciones', async () => {
    const lista = await listar(PROFESOR, secciones.s1, 200)

    // Creadas en el bloque anterior: Mínima (inicio del período), Control 1
    // (día 10) y Máxima (término del período).
    expect(lista.evaluaciones.map((e) => [e.nombre, e.fecha])).toEqual([
      ['Mínima', periodo.inicio],
      ['Control 1', dentro(10)],
      ['Máxima', periodo.termino],
    ])
    expect(lista.sumaPonderaciones).toBe(1 + 20 + 100)
  })

  it('una sección sin evaluaciones devuelve la lista vacía y suma 0', async () => {
    expect(await listar(profesorOtraSeccion, secciones.s2, 200)).toEqual({
      evaluaciones: [],
      sumaPonderaciones: 0,
    })
  })

  it.each([
    ['el ayudante', AYUDANTE],
    ['un alumno inscrito', ALUMNO],
    ['el Director de su universidad', DIRECTOR],
    ['el Director de otra universidad (solo lectura)', DIRECTOR_SUR],
  ])('%s la lee', async (_caso, correo) => {
    const lista = await listar(correo, secciones.s1, 200)
    expect(lista.evaluaciones).toHaveLength(3)
  })

  it.each([
    ['el Administrativo de la facultad', ADMIN_INGENIERIA, 403],
    ['un alumno no inscrito', () => alumnoNoInscrito, 403],
    ['un profesor de otra sección', () => profesorOtraSeccion, 403],
    ['un profesor de otra universidad', PROFESOR_SUR, 404],
  ])('%s no la lee (%#)', async (_caso, correo, estado) => {
    await listar(
      typeof correo === 'function' ? correo() : correo,
      secciones.s1,
      estado,
    )
  })
})

describe('RLS y sin DELETE (NOT-01)', () => {
  it('desde otra universidad no se ven las evaluaciones de Norte', async () => {
    await comoApp(
      {
        universidadId: await universidadDe('sur.cursus.test'),
        rol: 'PROFESOR',
      },
      async (q) => {
        expect(
          await q.query(`SELECT id FROM evaluacion WHERE seccion_id = $1`, [
            secciones.s1,
          ]),
        ).toEqual([])
      },
    )
  })

  it('no se puede insertar en otra universidad ni con un rol distinto de profesor', async () => {
    const norte = await universidadDe('norte.cursus.test')
    const sur = await universidadDe('sur.cursus.test')
    const creadaPor = await idDe(PROFESOR)
    const insertar = (q: QueryRunner) =>
      q.query(
        `INSERT INTO evaluacion (universidad_id, seccion_id, nombre, fecha, ponderacion, creada_por)
         VALUES ($1, $2, 'RLS', $3::date, 10, $4)`,
        [norte, secciones.s1, dentro(2), creadaPor],
      )

    for (const sesion of [
      { universidadId: sur, rol: 'PROFESOR' as const },
      { universidadId: norte, rol: 'AYUDANTE' as const },
      { universidadId: norte, rol: 'ADMINISTRATIVO' as const },
      { universidadId: norte, rol: 'DIRECTOR' as const },
    ]) {
      await comoApp(sesion, async (q) => {
        await expect(insertar(q)).rejects.toMatchObject({
          driverError: { code: SIN_PERMISO },
        })
      })
    }
  })

  it('cursus_app no tiene DELETE sobre evaluacion', async () => {
    const [{ puede }] = await bd.query<{ puede: boolean }[]>(
      `SELECT has_table_privilege($1, 'evaluacion', 'DELETE') AS puede`,
      [ROL_APP],
    )
    expect(puede).toBe(false)
  })

  it('no hay ruta para borrar evaluaciones', async () => {
    const token = await tokenDe(PROFESOR)
    const [{ id }] = await bd.query<{ id: string }[]>(
      `SELECT id FROM evaluacion WHERE archived_at IS NULL LIMIT 1`,
    )
    await request(app.getHttpServer())
      .delete(`/api/espacio/secciones/${secciones.s1}/evaluaciones/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404)
  })
})
