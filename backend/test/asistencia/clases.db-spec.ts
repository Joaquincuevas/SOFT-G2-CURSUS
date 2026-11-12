import type { Clase, Rol } from '@cursus/shared'
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

// ASI-01: base propia con el seed cargado, que se crea y se borra en cada
// ejecución. Todos los usuarios del seed comparten la contraseña.
const BD_TEST = `${process.env.POSTGRES_TEST_DB ?? 'cursus_test'}_clases`
const PASSWORD = 'contraseña-de-prueba'
const BD_ORIGINAL = process.env.POSTGRES_DB

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

// s1: horario completo; s2: otro profesor y un bloque en el día de hoy;
// sinHorario: del profesor base, sin bloques.
const secciones = { s1: '', s2: '', sinHorario: '' }
let profesorOtraSeccion = ''
let alumnoNoInscrito = ''
const periodo = { inicio: '', termino: '' }
// Hoy en la zona de la universidad (YYYY-MM-DD), según la base.
let hoy = ''

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
    .get(`/api/espacio/secciones/${seccionId}/clases`)
    .set('Authorization', `Bearer ${token}`)
    .expect(estado)
  return respuesta.body as Clase[]
}

async function crear(
  correo: string,
  seccionId: string,
  datos: Record<string, unknown>,
  estado: number,
) {
  const token = await tokenDe(correo)
  const respuesta = await request(app.getHttpServer())
    .post(`/api/espacio/secciones/${seccionId}/clases`)
    .set('Authorization', `Bearer ${token}`)
    .send(datos)
    .expect(estado)
  return respuesta.body as Clase & { message?: string | string[] }
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

const universidadDe = async (dominio: string) =>
  (
    await bd.query<{ id: string }[]>(
      'SELECT id FROM universidad WHERE dominio_correo = $1',
      [dominio],
    )
  )[0].id

// La primera fecha del período cuyo día ISO (1 = lunes) es `dia`, más
// `semanas` semanas.
function fechaDel(dia: number, semanas = 0) {
  const fecha = new Date(`${periodo.inicio}T00:00:00Z`)
  if (Number.isNaN(fecha.getTime())) {
    throw new Error(`Período sin fecha de inicio válida: ${periodo.inicio}`)
  }
  while (((fecha.getUTCDay() + 6) % 7) + 1 !== dia) {
    fecha.setUTCDate(fecha.getUTCDate() + 1)
  }
  fecha.setUTCDate(fecha.getUTCDate() + 7 * semanas)
  return fecha.toISOString().slice(0, 10)
}

const LUNES = 1
const MARTES = 2
const MIERCOLES = 3

const bloque = (
  seccionId: string,
  dia: number,
  inicio: string,
  termino: string,
  sala: string,
  archivado = false,
) =>
  bd.query<unknown>(
    `INSERT INTO horario_seccion (universidad_id, seccion_id, dia, inicio, termino, sala, archived_at)
     SELECT universidad_id, $1, $2, $3, $4, $5, ${archivado ? 'now()' : 'NULL'}
       FROM seccion WHERE id = $1`,
    [seccionId, dia, inicio, termino, sala],
  )

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

// Escenario, armado como dueño de las tablas (sin RLS).
async function armarEscenario() {
  secciones.s1 = await seccionDe('ICC101', 1)
  secciones.s2 = await seccionDe('ICC101', 2)
  secciones.sinHorario = await seccionDe('ICC201', 1)
  const correosDe = (rol: Rol) =>
    bd.query<{ correo: string }[]>(
      `SELECT u.correo FROM usuario u JOIN universidad un ON un.id = u.universidad_id
        WHERE u.rol = $1 AND un.dominio_correo = 'norte.cursus.test'
          AND u.correo NOT IN ($2, $3, $4) ORDER BY u.correo LIMIT 1`,
      [rol, PROFESOR, AYUDANTE, ALUMNO],
    )
  profesorOtraSeccion = (await correosDe('PROFESOR'))[0].correo
  alumnoNoInscrito = (await correosDe('ALUMNO'))[0].correo

  const asignar = async (seccionId: string, correo: string) =>
    bd.query<unknown>('UPDATE seccion SET profesor_id = $2 WHERE id = $1', [
      seccionId,
      await idDe(correo),
    ])
  await asignar(secciones.s1, PROFESOR)
  await asignar(secciones.s2, profesorOtraSeccion)
  await asignar(secciones.sinHorario, PROFESOR)
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

  // El período del curso incluye hoy (en Santiago), para probar la fecha
  // por defecto sin depender del día en que corra el test.
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

  // s1: lunes 08:30 y 10:15, miércoles 10:00; un bloque archivado el martes.
  await bloque(secciones.s1, LUNES, '08:30', '10:00', 'Sala A-101')
  await bloque(secciones.s1, LUNES, '10:15', '11:45', 'Sala A-102')
  await bloque(secciones.s1, MIERCOLES, '10:00', '11:30', 'Sala B-202')
  await bloque(secciones.s1, MARTES, '08:30', '10:00', 'Sala Z-999', true)
  // s2: un bloque en el día de la semana de hoy.
  const [{ dia }] = await bd.query<{ dia: number }[]>(
    `SELECT EXTRACT(ISODOW FROM $1::date)::int AS dia`,
    [hoy],
  )
  await bloque(secciones.s2, dia, '07:00', '08:00', 'Sala Hoy')
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

describe('POST /api/espacio/secciones/:id/clases (ASI-01)', () => {
  it('el profesor registra una clase: copia el bloque y queda como creada_por', async () => {
    const creada = await crear(
      PROFESOR,
      secciones.s1,
      { fecha: fechaDel(LUNES, 1), inicio: '08:30' },
      201,
    )

    expect(creada).toEqual({
      id: expect.any(String) as string,
      fecha: fechaDel(LUNES, 1),
      inicio: '08:30',
      termino: '10:00',
      sala: 'Sala A-101',
    })
    const [fila] = await bd.query<{ creada_por: string; seccion_id: string }[]>(
      'SELECT creada_por, seccion_id FROM clase WHERE id = $1',
      [creada.id],
    )
    expect(fila).toEqual({
      creada_por: await idDe(PROFESOR),
      seccion_id: secciones.s1,
    })
  })

  it('sin fecha usa hoy en America/Santiago, calculado en el backend', async () => {
    const creada = await crear(
      profesorOtraSeccion,
      secciones.s2,
      { inicio: '07:00' },
      201,
    )
    expect(creada).toMatchObject({
      fecha: hoy,
      inicio: '07:00',
      sala: 'Sala Hoy',
    })
  })

  it('la misma fecha con otro bloque es otra clase', async () => {
    await crear(
      PROFESOR,
      secciones.s1,
      { fecha: fechaDel(LUNES, 1), inicio: '10:15' },
      201,
    )
  })

  describe('clase repetida (misma sección, fecha y bloque): 409', () => {
    it('responde 409 con un mensaje claro', async () => {
      const respuesta = await crear(
        PROFESOR,
        secciones.s1,
        { fecha: fechaDel(LUNES, 1), inicio: '08:30' },
        409,
      )
      expect(respuesta.message).toBe(
        `Ya existe una clase de esta sección el ${fechaDel(LUNES, 1)} en el bloque de las 08:30`,
      )
    })

    it('sigue siendo 409 aunque el horario se haya vuelto a guardar (bloques nuevos)', async () => {
      // GES-10 archiva y recrea los bloques: la unicidad no depende de su id.
      await bd.query(
        `UPDATE horario_seccion SET archived_at = now()
          WHERE seccion_id = $1 AND archived_at IS NULL`,
        [secciones.s1],
      )
      await bloque(secciones.s1, LUNES, '08:30', '10:00', 'Sala A-101')
      await bloque(secciones.s1, LUNES, '10:15', '11:45', 'Sala A-102')
      await bloque(secciones.s1, MIERCOLES, '10:00', '11:30', 'Sala B-202')

      await crear(
        PROFESOR,
        secciones.s1,
        { fecha: fechaDel(LUNES, 1), inicio: '08:30' },
        409,
      )
    })

    it('una clase archivada no bloquea registrarla de nuevo', async () => {
      const fecha = fechaDel(MIERCOLES, 2)
      const primera = await crear(
        PROFESOR,
        secciones.s1,
        { fecha, inicio: '10:00' },
        201,
      )
      await bd.query('UPDATE clase SET archived_at = now() WHERE id = $1', [
        primera.id,
      ])
      await crear(PROFESOR, secciones.s1, { fecha, inicio: '10:00' }, 201)
    })
  })

  describe('validaciones: 400', () => {
    it.each([
      ['sin inicio', () => ({ fecha: fechaDel(LUNES, 2) })],
      [
        'inicio con otro formato',
        () => ({ fecha: fechaDel(LUNES, 2), inicio: '8:30' }),
      ],
      [
        'fecha con otro formato',
        () => ({ fecha: '15/09/2026', inicio: '08:30' }),
      ],
      ['fecha inexistente', () => ({ fecha: '2026-02-30', inicio: '08:30' })],
      ['un campo no esperado', () => ({ inicio: '08:30', sala: 'Otra' })],
    ])('%s', async (_caso, datos) => {
      await crear(PROFESOR, secciones.s1, datos(), 400)
    })

    it('fecha fuera del período del curso, con el rango en el mensaje', async () => {
      const antes = new Date(`${periodo.inicio}T00:00:00Z`)
      antes.setUTCDate(antes.getUTCDate() - 1)
      const respuesta = await crear(
        PROFESOR,
        secciones.s1,
        { fecha: antes.toISOString().slice(0, 10), inicio: '08:30' },
        400,
      )
      expect(respuesta.message).toBe(
        `La fecha debe estar dentro del período del curso (del ${periodo.inicio} al ${periodo.termino})`,
      )
    })

    it('sin un bloque activo ese día a esa hora (el del martes está archivado)', async () => {
      const respuesta = await crear(
        PROFESOR,
        secciones.s1,
        { fecha: fechaDel(MARTES, 1), inicio: '08:30' },
        400,
      )
      expect(respuesta.message).toBe(
        'La sección no tiene un bloque el martes a las 08:30',
      )
    })

    it('una sección sin horario', async () => {
      const respuesta = await crear(
        PROFESOR,
        secciones.sinHorario,
        { fecha: fechaDel(LUNES, 1), inicio: '08:30' },
        400,
      )
      expect(respuesta.message).toBe(
        'La sección aún no tiene horario; lo carga el Administrativo',
      )
    })
  })

  describe('solo el profesor de la sección registra', () => {
    const datos = () => ({ fecha: fechaDel(LUNES, 3), inicio: '08:30' })

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

    it('ninguno de esos intentos guardó una clase', async () => {
      const [{ total }] = await bd.query<{ total: string }[]>(
        'SELECT count(*) AS total FROM clase WHERE fecha = $1::date',
        [fechaDel(LUNES, 3)],
      )
      expect(Number(total)).toBe(0)
    })
  })
})

describe('GET /api/espacio/secciones/:id/clases (ASI-01)', () => {
  it('lista las clases activas por fecha y bloque', async () => {
    const clases = await listar(PROFESOR, secciones.s1, 200)

    expect(clases.map((c) => [c.fecha, c.inicio])).toEqual([
      [fechaDel(LUNES, 1), '08:30'],
      [fechaDel(LUNES, 1), '10:15'],
      [fechaDel(MIERCOLES, 2), '10:00'],
    ])
  })

  it.each([
    ['el ayudante', AYUDANTE],
    ['el Director de su universidad', DIRECTOR],
    ['el Director de otra universidad (solo lectura)', DIRECTOR_SUR],
  ])('%s la lee', async (_caso, correo) => {
    expect(await listar(correo, secciones.s1, 200)).toHaveLength(3)
  })

  it.each([
    ['un alumno inscrito (ve su asistencia en ASI-06)', ALUMNO, 403],
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

describe('RLS y sin DELETE (ASI-01)', () => {
  it('desde otra universidad no se ven las clases de Norte', async () => {
    await comoApp(
      {
        universidadId: await universidadDe('sur.cursus.test'),
        rol: 'PROFESOR',
      },
      async (q) => {
        expect(
          await q.query('SELECT id FROM clase WHERE seccion_id = $1', [
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
        `INSERT INTO clase (universidad_id, seccion_id, fecha, inicio, termino, sala, creada_por)
         VALUES ($1, $2, $3::date, '12:00', '13:00', 'RLS', $4)`,
        [norte, secciones.s1, fechaDel(LUNES, 4), creadaPor],
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

  it('cursus_app no tiene DELETE sobre clase', async () => {
    const [{ puede }] = await bd.query<{ puede: boolean }[]>(
      `SELECT has_table_privilege($1, 'clase', 'DELETE') AS puede`,
      [ROL_APP],
    )
    expect(puede).toBe(false)
  })

  it('no hay ruta para borrar clases', async () => {
    const token = await tokenDe(PROFESOR)
    const [{ id }] = await bd.query<{ id: string }[]>(
      'SELECT id FROM clase WHERE archived_at IS NULL LIMIT 1',
    )
    await request(app.getHttpServer())
      .delete(`/api/espacio/secciones/${secciones.s1}/clases/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404)
  })
})
