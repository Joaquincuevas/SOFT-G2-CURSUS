import type { Actividad, CrearActividad, Rol } from '@cursus/shared'
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

// MAT-08: base propia con el seed cargado, que se crea y se borra en cada
// ejecución. Todos los usuarios del seed comparten la contraseña.
const BD_TEST = `${process.env.POSTGRES_TEST_DB ?? 'cursus_test'}_actividades`
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
// Hoy en Santiago y el período del curso de ICC101 (YYYY-MM-DD).
let hoy = ''
const periodo = { inicio: '', termino: '' }
// Una fecha desplazada n días desde hoy (en Santiago).
const desdeHoy = (dias: number) => {
  const fecha = new Date(`${hoy}T00:00:00Z`)
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
    .get(`/api/espacio/secciones/${seccionId}/actividades`)
    .set('Authorization', `Bearer ${token}`)
    .expect(estado)
  return respuesta.body as Actividad[]
}

async function crear(
  correo: string,
  seccionId: string,
  datos: Partial<CrearActividad> & Record<string, unknown>,
  estado: number,
) {
  const token = await tokenDe(correo)
  const respuesta = await request(app.getHttpServer())
    .post(`/api/espacio/secciones/${seccionId}/actividades`)
    .set('Authorization', `Bearer ${token}`)
    .send(datos)
    .expect(estado)
  return respuesta.body as Actividad & { message?: string | string[] }
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

// El instante (ISO 8601) de una fecha y hora de Santiago, calculado por
// PostgreSQL.
const instanteEnSantiago = async (fecha: string, hora: string) =>
  (
    await bd.query<{ instante: Date }[]>(
      `SELECT ($1::date + $2::time) AT TIME ZONE 'America/Santiago' AS instante`,
      [fecha, hora],
    )
  )[0].instante.toISOString()

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

  // El período del curso incluye hoy (en Santiago), para probar plazos
  // pasados y futuros sin depender del día en que corra el test.
  const [{ fecha }] = await bd.query<{ fecha: string }[]>(
    `SELECT to_char((now() AT TIME ZONE 'America/Santiago')::date, 'YYYY-MM-DD') AS fecha`,
  )
  hoy = fecha
  // (En TypeORM, un UPDATE ... RETURNING devuelve [filas, afectadas]: por
  // eso el rango se lee con un SELECT aparte.)
  await bd.query(
    `UPDATE periodo p
        SET fecha_inicio = LEAST(p.fecha_inicio, $2::date - 30),
            fecha_termino = GREATEST(p.fecha_termino, $2::date + 60)
       FROM curso c JOIN seccion s ON s.curso_id = c.id
      WHERE c.periodo_id = p.id AND s.id = $1`,
    [secciones.s1, hoy],
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

describe('POST /api/espacio/secciones/:id/actividades (MAT-08)', () => {
  it('el profesor de la sección crea una actividad con título, instrucciones y plazo en hora de Chile', async () => {
    const creada = await crear(
      PROFESOR,
      secciones.s1,
      {
        titulo: '  Informe   1 ',
        instrucciones: '  Entregar en PDF.\nMáximo 5 páginas.  ',
        fecha: desdeHoy(7),
        hora: '23:59',
      },
      201,
    )

    expect(creada).toEqual({
      id: expect.any(String) as string,
      titulo: 'Informe 1',
      instrucciones: 'Entregar en PDF.\nMáximo 5 páginas.',
      plazo: await instanteEnSantiago(desdeHoy(7), '23:59'),
      cerrada: false,
    })
    const [fila] = await bd.query<{ creada_por: string; seccion_id: string }[]>(
      'SELECT creada_por, seccion_id FROM actividad WHERE id = $1',
      [creada.id],
    )
    expect(fila).toEqual({
      creada_por: await idDe(PROFESOR),
      seccion_id: secciones.s1,
    })
  })

  it('acepta el último día del período', async () => {
    await crear(
      PROFESOR,
      secciones.s1,
      {
        titulo: 'Informe final',
        instrucciones: 'Proyecto completo.',
        fecha: periodo.termino,
        hora: '12:00',
      },
      201,
    )
  })

  describe('validaciones: 400', () => {
    const valida = () => ({
      titulo: 'Informe',
      instrucciones: 'Instrucciones',
      fecha: desdeHoy(5),
      hora: '18:00',
    })

    it.each([
      ['sin título', { titulo: undefined }],
      ['sin instrucciones', { instrucciones: undefined }],
      ['sin fecha', { fecha: undefined }],
      ['sin hora', { hora: undefined }],
      ['título vacío o solo espacios', { titulo: '   ' }],
      ['título de más de 100 caracteres', { titulo: 'x'.repeat(101) }],
      ['instrucciones solo espacios', { instrucciones: ' \n ' }],
      [
        'instrucciones de más de 2000 caracteres',
        { instrucciones: 'x'.repeat(2001) },
      ],
      ['fecha con otro formato', { fecha: '15/09/2026' }],
      ['fecha inexistente', { fecha: '2026-02-30' }],
      ['hora con otro formato', { hora: '9:00' }],
      ['hora inexistente', { hora: '24:00' }],
      ['un campo no esperado', { seccionId: secciones.s2 }],
      ['título con un carácter de control', { titulo: 'Informe\u0000' }],
      [
        'instrucciones con un carácter de control',
        { instrucciones: 'Texto\u0007' },
      ],
    ])('%s', async (_caso, cambio) => {
      await crear(PROFESOR, secciones.s1, { ...valida(), ...cambio }, 400)
    })

    it('fecha fuera del período del curso, con el rango en el mensaje', async () => {
      const despues = new Date(`${periodo.termino}T00:00:00Z`)
      despues.setUTCDate(despues.getUTCDate() + 1)
      const respuesta = await crear(
        PROFESOR,
        secciones.s1,
        { ...valida(), fecha: despues.toISOString().slice(0, 10) },
        400,
      )
      expect(respuesta.message).toBe(
        `La fecha límite debe estar dentro del período del curso (del ${periodo.inicio} al ${periodo.termino})`,
      )
    })

    it('un plazo que ya pasó', async () => {
      const respuesta = await crear(
        PROFESOR,
        secciones.s1,
        { ...valida(), fecha: desdeHoy(-1), hora: '10:00' },
        400,
      )
      expect(respuesta.message).toBe(
        'La fecha y hora límite deben ser posteriores a la hora actual',
      )
    })

    it('la base también rechaza un título vacío o instrucciones vacías (CHECK)', async () => {
      for (const [titulo, instrucciones] of [
        ['', 'Algo'],
        [' Con espacios ', 'Algo'],
        ['Algo', '   '],
      ]) {
        await expect(
          bd.query(
            `INSERT INTO actividad (universidad_id, seccion_id, titulo, instrucciones, plazo, creada_por)
             SELECT universidad_id, id, $2, $3, now() + interval '1 day', $4
               FROM seccion WHERE id = $1`,
            [secciones.s1, titulo, instrucciones, await idDe(PROFESOR)],
          ),
        ).rejects.toMatchObject({ driverError: { code: CHECK } })
      }
    })
  })

  describe('solo el profesor de la sección crea', () => {
    const datos = () => ({
      titulo: 'Intruso',
      instrucciones: 'No debería quedar',
      fecha: desdeHoy(3),
      hora: '12:00',
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

    it('ninguno de esos intentos guardó una actividad', async () => {
      const [{ total }] = await bd.query<{ total: string }[]>(
        `SELECT count(*) AS total FROM actividad WHERE titulo = 'Intruso'`,
      )
      expect(Number(total)).toBe(0)
    })
  })
})

describe('GET /api/espacio/secciones/:id/actividades (MAT-08)', () => {
  beforeAll(async () => {
    // Una actividad cuyo plazo ya pasó (se inserta directo: la API no acepta
    // plazos pasados) y una archivada, que no aparece.
    await bd.query(
      `INSERT INTO actividad (universidad_id, seccion_id, titulo, instrucciones, plazo, creada_por, archived_at)
       SELECT universidad_id, id, 'Vencida', 'Ya cerró', now() - interval '1 day', $2::uuid, NULL
         FROM seccion WHERE id = $1
       UNION ALL
       SELECT universidad_id, id, 'Archivada', 'No se ve', now() + interval '2 days', $2::uuid, now()
         FROM seccion WHERE id = $1`,
      [secciones.s1, await idDe(PROFESOR)],
    )
  })

  it('lista las actividades activas por plazo y marca como cerrada la que venció', async () => {
    const lista = await listar(PROFESOR, secciones.s1, 200)

    // Creadas en el bloque anterior: Informe 1 (en 7 días) e Informe final
    // (término del período).
    expect(lista.map((a) => [a.titulo, a.cerrada])).toEqual([
      ['Vencida', true],
      ['Informe 1', false],
      ['Informe final', false],
    ])
    expect(lista[1]).toMatchObject({
      instrucciones: 'Entregar en PDF.\nMáximo 5 páginas.',
      plazo: await instanteEnSantiago(desdeHoy(7), '23:59'),
    })
  })

  it('una sección sin actividades devuelve la lista vacía', async () => {
    expect(await listar(profesorOtraSeccion, secciones.s2, 200)).toEqual([])
  })

  it.each([
    ['el ayudante', AYUDANTE],
    ['un alumno inscrito', ALUMNO],
    ['el Director de su universidad', DIRECTOR],
    ['el Director de otra universidad (solo lectura)', DIRECTOR_SUR],
  ])('%s la lee', async (_caso, correo) => {
    const lista = await listar(correo, secciones.s1, 200)
    expect(lista).toHaveLength(3)
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

describe('RLS y sin DELETE (MAT-08)', () => {
  it('desde otra universidad no se ven las actividades de Norte', async () => {
    await comoApp(
      {
        universidadId: await universidadDe('sur.cursus.test'),
        rol: 'PROFESOR',
      },
      async (q) => {
        expect(
          await q.query(`SELECT id FROM actividad WHERE seccion_id = $1`, [
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
        `INSERT INTO actividad (universidad_id, seccion_id, titulo, instrucciones, plazo, creada_por)
         VALUES ($1, $2, 'RLS', 'RLS', now() + interval '1 day', $3)`,
        [norte, secciones.s1, creadaPor],
      )

    // Control positivo: el profesor de Norte sí inserta.
    await comoApp({ universidadId: norte, rol: 'PROFESOR' }, async (q) => {
      await expect(insertar(q)).resolves.toBeDefined()
    })
    for (const sesion of [
      { universidadId: sur, rol: 'PROFESOR' as const },
      { universidadId: norte, rol: 'AYUDANTE' as const },
      { universidadId: norte, rol: 'ALUMNO' as const },
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

  it('cursus_app no tiene DELETE sobre actividad', async () => {
    const [{ puede }] = await bd.query<{ puede: boolean }[]>(
      `SELECT has_table_privilege($1, 'actividad', 'DELETE') AS puede`,
      [ROL_APP],
    )
    expect(puede).toBe(false)
  })

  it('no hay ruta para borrar actividades', async () => {
    const token = await tokenDe(PROFESOR)
    const [{ id }] = await bd.query<{ id: string }[]>(
      `SELECT id FROM actividad WHERE archived_at IS NULL LIMIT 1`,
    )
    await request(app.getHttpServer())
      .delete(`/api/espacio/secciones/${secciones.s1}/actividades/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404)
  })
})
