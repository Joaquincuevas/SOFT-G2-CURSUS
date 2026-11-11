import {
  type ErrorListaNotas,
  type ErrorNotasFaltantes,
  type ErrorNotasInvalidas,
  type EvaluacionesSeccion,
  type EstadoEnvioNotas,
  type HistorialNota,
  MAX_NOTAS_GUARDADO,
  MENSAJES_NOTA_INVALIDA,
  type MisNotasSeccion,
  type NotasEvaluacion,
  type Rol,
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

// NOT-05: base propia con el seed cargado, que se crea y se borra en cada
// ejecución. Todos los usuarios del seed comparten la contraseña.
const BD_TEST = `${process.env.POSTGRES_TEST_DB ?? 'cursus_test'}_notas_ingreso`
const PASSWORD = 'contraseña-de-prueba'
// Hash con formato válido; los alumnos creados aquí no inician sesión.
const HASH = '$2b$10$abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOP'
const BD_ORIGINAL = process.env.POSTGRES_DB
const SIN_PERMISO = '42501'
const CHECK = '23514'
const FOREIGN_KEY = '23503'
const UNIQUE = '23505'
const NO_EXISTE = '00000000-0000-4000-8000-000000000000'

const PROFESOR = 'profesor@norte.cursus.test'
const AYUDANTE = 'ayudante@norte.cursus.test'
const ALUMNO = 'alumno@norte.cursus.test'
const ADMIN_INGENIERIA = 'administrativo.ingenieria@norte.cursus.test'
const DIRECTOR = 'director@norte.cursus.test'
const DIRECTOR_SUR = 'director@sur.cursus.test'
const PROFESOR_SUR = 'profesor@sur.cursus.test'
const AYUDANTE_SUR = 'ayudante@sur.cursus.test'

let admin: DataSource
let bd: DataSource
let app: INestApplication<App>
const tokens = new Map<string, string>()

const ids = { norte: '', sur: '' }
const secciones = { s1: '', s2: '' }
// Alumnos activos de s1 (cinco, en orden alfabético), uno retirado y uno que
// no está inscrito.
const alumnos = {
  base: '',
  ana: '',
  bruno: '',
  carla: '',
  zoe: '',
  retirado: '',
  noInscrito: '',
}
// Segundo ayudante de s1 (para los guardados simultáneos) y ayudante de s2.
let otroAyudante = ''
let ayudanteOtraSeccion = ''

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

const ruta = (seccionId: string, evaluacionId: string) =>
  `/api/espacio/secciones/${seccionId}/evaluaciones/${evaluacionId}/notas`

// El token se pide antes de crear la petición: si no, supertest cierra el
// servidor de una petición al terminar la otra.
async function leer(
  correo: string,
  evaluacionId: string,
  estado: number,
  seccionId = secciones.s1,
) {
  const token = await tokenDe(correo)
  const respuesta = await request(app.getHttpServer())
    .get(ruta(seccionId, evaluacionId))
    .set('Authorization', `Bearer ${token}`)
    .expect(estado)
  return respuesta.body as NotasEvaluacion
}

async function guardar(
  correo: string,
  evaluacionId: string,
  cuerpo: unknown,
  estado: number,
  seccionId = secciones.s1,
) {
  const token = await tokenDe(correo)
  const respuesta = await request(app.getHttpServer())
    .put(ruta(seccionId, evaluacionId))
    .set('Authorization', `Bearer ${token}`)
    .send(cuerpo as object)
    .expect(estado)
  return respuesta.body as NotasEvaluacion &
    ErrorListaNotas &
    Partial<Pick<ErrorNotasInvalidas, 'invalidas'>> & {
      message: string | string[]
    }
}

const notasDe = (notas: [alumnoId: string, nota: unknown][]) => ({
  notas: notas.map(([alumnoId, nota]) => ({ alumnoId, nota })),
})

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

async function crearAlumno(seccionId: string, nombre: string) {
  const correo = `${nombre
    .normalize('NFD')
    .replace(/[^a-zA-Z]/g, '')
    .toLowerCase()}.notas@norte.cursus.test`
  const [{ id }] = await bd.query<{ id: string }[]>(
    `INSERT INTO usuario (universidad_id, nombre, correo, password_hash, rol)
     SELECT universidad_id, $2, $3, $4, 'ALUMNO' FROM seccion WHERE id = $1
     RETURNING id`,
    [seccionId, nombre, correo, HASH],
  )
  return id
}

const inscribir = (seccionId: string, alumnoId: string) =>
  bd.query<unknown>(
    `INSERT INTO inscripcion (universidad_id, seccion_id, usuario_id)
     SELECT universidad_id, $1, $2 FROM seccion WHERE id = $1`,
    [seccionId, alumnoId],
  )

const asignarAyudante = async (seccionId: string, correo: string) =>
  bd.query<unknown>(
    `INSERT INTO ayudante_seccion (universidad_id, seccion_id, usuario_id)
     SELECT universidad_id, $1, $2 FROM seccion WHERE id = $1`,
    [seccionId, await idDe(correo)],
  )

// Una evaluación nueva de la sección, para que cada prueba parta sin notas.
async function crearEvaluacion(
  seccionId = secciones.s1,
  { archivada = false } = {},
) {
  const [{ id }] = await bd.query<{ id: string }[]>(
    `INSERT INTO evaluacion (universidad_id, seccion_id, nombre, fecha, ponderacion, creada_por, archived_at)
     SELECT s.universidad_id, s.id, 'Control ' || gen_random_uuid(), p.fecha_inicio, 20,
            COALESCE(s.profesor_id, $2), ${archivada ? 'now()' : 'NULL'}
       FROM seccion s JOIN curso c ON c.id = s.curso_id
       JOIN periodo p ON p.id = c.periodo_id
      WHERE s.id = $1
     RETURNING id`,
    [seccionId, await idDe(PROFESOR)],
  )
  return id
}

const filasDe = (evaluacionId: string) =>
  bd.query<
    {
      alumno_id: string
      valor: string
      estado: string
      propuesta_por: string
    }[]
  >(
    `SELECT alumno_id, valor, estado, propuesta_por FROM nota
      WHERE evaluacion_id = $1 AND archived_at IS NULL ORDER BY alumno_id`,
    [evaluacionId],
  )

const eventosDe = (evaluacionId: string) =>
  bd.query<
    {
      tipo: string
      alumno_id: string
      nota_anterior: string | null
      nota_nueva: string
      responsable_id: string
    }[]
  >(
    `SELECT tipo, alumno_id, nota_anterior, nota_nueva, responsable_id
       FROM nota_cambio WHERE evaluacion_id = $1 ORDER BY fecha, id`,
    [evaluacionId],
  )

// Inserta como dueño de la tabla (sin RLS ni las reglas del servicio).
async function insertarDirecto(
  evaluacionId: string,
  columnas: Record<string, unknown>,
) {
  const fila = {
    universidad_id: ids.norte,
    evaluacion_id: evaluacionId,
    alumno_id: alumnos.base,
    valor: 5,
    propuesta_por: await idDe(AYUDANTE),
    ...columnas,
  }
  const nombres = Object.keys(fila)
  return bd.query<unknown>(
    `INSERT INTO nota (${nombres.join(', ')})
     VALUES (${nombres.map((_, i) => `$${i + 1}`).join(', ')})`,
    Object.values(fila),
  )
}

// Espera a que haya `cantidad` consultas de la base de este test esperando un
// lock (como mucho 5 s).
async function esperarBloqueados(cantidad: number) {
  for (let intento = 0; intento < 100; intento++) {
    const [{ esperando }] = await bd.query<{ esperando: string }[]>(
      `SELECT count(*) AS esperando FROM pg_stat_activity
        WHERE datname = $1 AND wait_event_type = 'Lock'`,
      [BD_TEST],
    )
    if (Number(esperando) >= cantidad) return
    await new Promise((resolver) => setTimeout(resolver, 50))
  }
  throw new Error(`No hubo ${cantidad} consultas esperando un lock`)
}

// Consulta con el rol de la API, en una transacción que se revierte.
async function comoApp(
  sesion: { universidadId: string; rol: Rol; usuarioId?: string },
  prueba: (q: QueryRunner) => Promise<void>,
) {
  const q = bd.createQueryRunner()
  await q.startTransaction()
  try {
    await q.query(`SET LOCAL ROLE ${ROL_APP}`)
    await q.query(
      `SELECT set_config('app.universidad_id', $1, true),
              set_config('app.rol', $2, true),
              set_config('app.usuario_id', $3, true)`,
      [sesion.universidadId, sesion.rol, sesion.usuarioId ?? ''],
    )
    await prueba(q)
  } finally {
    await q.rollbackTransaction()
    await q.release()
  }
}

// Escenario, armado como dueño de las tablas (sin RLS).
async function armarEscenario() {
  ids.norte = await universidadDe('norte.cursus.test')
  ids.sur = await universidadDe('sur.cursus.test')
  secciones.s1 = await seccionDe('ICC101', 1)
  secciones.s2 = await seccionDe('ICC101', 2)
  await bd.query('UPDATE seccion SET profesor_id = $2 WHERE id = $1', [
    secciones.s1,
    await idDe(PROFESOR),
  ])

  // Dos ayudantes de demo del seed: uno más en s1 y otro solo en s2.
  const demo = await bd.query<{ correo: string }[]>(
    `SELECT u.correo FROM usuario u
      WHERE u.universidad_id = $1 AND u.rol = 'AYUDANTE' AND u.correo <> $2
      ORDER BY u.correo LIMIT 2`,
    [ids.norte, AYUDANTE],
  )
  otroAyudante = demo[0].correo
  ayudanteOtraSeccion = demo[1].correo
  await asignarAyudante(secciones.s1, AYUDANTE)
  await asignarAyudante(secciones.s1, otroAyudante)
  await asignarAyudante(secciones.s2, ayudanteOtraSeccion)

  alumnos.base = await idDe(ALUMNO)
  alumnos.ana = await crearAlumno(secciones.s1, 'Ana Ávila')
  alumnos.bruno = await crearAlumno(secciones.s1, 'Bruno Díaz')
  alumnos.carla = await crearAlumno(secciones.s1, 'Carla Soto')
  alumnos.zoe = await crearAlumno(secciones.s1, 'Zoe Ruiz')
  alumnos.retirado = await crearAlumno(secciones.s1, 'Raúl Retirado')
  alumnos.noInscrito = await crearAlumno(secciones.s1, 'Nadie Inscrito')
  for (const id of [
    alumnos.base,
    alumnos.ana,
    alumnos.bruno,
    alumnos.carla,
    alumnos.zoe,
    alumnos.retirado,
  ]) {
    await inscribir(secciones.s1, id)
  }
  await bd.query(
    `UPDATE inscripcion SET archived_at = now(), archivada_por = $3
      WHERE seccion_id = $1 AND usuario_id = $2`,
    [secciones.s1, alumnos.retirado, await idDe(ADMIN_INGENIERIA)],
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

describe('GET .../evaluaciones/:evaluacionId/notas (NOT-05)', () => {
  it('todos los alumnos activos de la sección, por nombre, sin nota ni correo', async () => {
    const evaluacion = await crearEvaluacion()
    const notas = await leer(AYUDANTE, evaluacion, 200)

    expect(notas.evaluacion).toMatchObject({ id: evaluacion, ponderacion: 20 })
    expect(notas.alumnos).toEqual([
      { id: alumnos.base, nombre: 'Alumno Norte', nota: null, estado: null },
      { id: alumnos.ana, nombre: 'Ana Ávila', nota: null, estado: null },
      { id: alumnos.bruno, nombre: 'Bruno Díaz', nota: null, estado: null },
      { id: alumnos.carla, nombre: 'Carla Soto', nota: null, estado: null },
      { id: alumnos.zoe, nombre: 'Zoe Ruiz', nota: null, estado: null },
    ])
  })

  it.each([
    ['el profesor de la sección', PROFESOR],
    ['el Director de su universidad', DIRECTOR],
    ['el Director de otra universidad (solo lectura)', DIRECTOR_SUR],
  ])('%s lee las propuestas', async (_caso, correo) => {
    const evaluacion = await crearEvaluacion()
    await guardar(AYUDANTE, evaluacion, notasDe([[alumnos.ana, 6.2]]), 200)

    const notas = await leer(correo, evaluacion, 200)
    expect(notas.alumnos.find((a) => a.id === alumnos.ana)).toEqual({
      id: alumnos.ana,
      nombre: 'Ana Ávila',
      nota: 6.2,
      estado: 'PROPUESTA',
    })
  })

  it.each([
    ['un alumno inscrito (ve las suyas publicadas en mis-notas)', ALUMNO, 403],
    ['el Administrativo de la facultad', ADMIN_INGENIERIA, 403],
    ['un ayudante de otra sección', () => ayudanteOtraSeccion, 403],
    ['un profesor de otra universidad', PROFESOR_SUR, 404],
  ])('%s no las lee (%#)', async (_caso, correo, estado) => {
    const evaluacion = await crearEvaluacion()
    await leer(
      typeof correo === 'function' ? correo() : correo,
      evaluacion,
      estado,
    )
  })

  it.each([
    ['de otra sección', () => crearEvaluacion(secciones.s2)],
    ['archivada', () => crearEvaluacion(secciones.s1, { archivada: true })],
    ['que no existe', () => Promise.resolve(NO_EXISTE)],
  ])('una evaluación %s responde 404', async (_caso, evaluacion) => {
    await leer(AYUDANTE, await evaluacion(), 404)
  })

  it('un id de evaluación que no es UUID responde 400', async () => {
    await leer(AYUDANTE, 'no-es-uuid', 400)
  })
})

describe('PUT .../evaluaciones/:evaluacionId/notas (NOT-05)', () => {
  it('guarda como propuesta, con un evento PROPUESTA por nota (nota anterior nula la primera vez)', async () => {
    const evaluacion = await crearEvaluacion()
    const ayudante = await idDe(AYUDANTE)

    const guardadas = await guardar(
      AYUDANTE,
      evaluacion,
      notasDe([
        [alumnos.ana, 5.5],
        [alumnos.zoe, 4],
      ]),
      200,
    )

    expect(
      guardadas.alumnos.map(({ id, nota, estado }) => ({ id, nota, estado })),
    ).toEqual([
      { id: alumnos.base, nota: null, estado: null },
      { id: alumnos.ana, nota: 5.5, estado: 'PROPUESTA' },
      { id: alumnos.bruno, nota: null, estado: null },
      { id: alumnos.carla, nota: null, estado: null },
      { id: alumnos.zoe, nota: 4, estado: 'PROPUESTA' },
    ])
    expect(await filasDe(evaluacion)).toEqual(
      expect.arrayContaining([
        {
          alumno_id: alumnos.ana,
          valor: '5.5',
          estado: 'PROPUESTA',
          propuesta_por: ayudante,
        },
        {
          alumno_id: alumnos.zoe,
          valor: '4.0',
          estado: 'PROPUESTA',
          propuesta_por: ayudante,
        },
      ]),
    )
    expect(await eventosDe(evaluacion)).toEqual([
      {
        tipo: 'PROPUESTA',
        alumno_id: alumnos.ana,
        nota_anterior: null,
        nota_nueva: '5.5',
        responsable_id: ayudante,
      },
      {
        tipo: 'PROPUESTA',
        alumno_id: alumnos.zoe,
        nota_anterior: null,
        nota_nueva: '4.0',
        responsable_id: ayudante,
      },
    ])
  })

  it('guardado parcial: 2 de 5 y después los otros 3 conserva las dos primeras', async () => {
    const evaluacion = await crearEvaluacion()
    await guardar(
      AYUDANTE,
      evaluacion,
      notasDe([
        [alumnos.base, 6],
        [alumnos.ana, 5.5],
      ]),
      200,
    )

    const todas = await guardar(
      AYUDANTE,
      evaluacion,
      notasDe([
        [alumnos.bruno, 3.9],
        [alumnos.carla, 7],
        [alumnos.zoe, 1],
      ]),
      200,
    )

    expect(todas.alumnos.map((a) => a.nota)).toEqual([6, 5.5, 3.9, 7, 1])
    expect(todas.alumnos.every((a) => a.estado === 'PROPUESTA')).toBe(true)
    expect(await filasDe(evaluacion)).toHaveLength(5)
    expect(await eventosDe(evaluacion)).toHaveLength(5)
    // Al volver, la lectura recupera las cinco.
    expect((await leer(AYUDANTE, evaluacion, 200)).alumnos).toEqual(
      todas.alumnos,
    )
  })

  it('guardar la misma nota no deja evento; cambiarla deja la anterior en la auditoría', async () => {
    const evaluacion = await crearEvaluacion()
    await guardar(AYUDANTE, evaluacion, notasDe([[alumnos.ana, 5.5]]), 200)
    await guardar(AYUDANTE, evaluacion, notasDe([[alumnos.ana, 5.5]]), 200)
    expect(await eventosDe(evaluacion)).toHaveLength(1)

    await guardar(otroAyudante, evaluacion, notasDe([[alumnos.ana, 6]]), 200)

    const eventos = await eventosDe(evaluacion)
    expect(eventos).toHaveLength(2)
    expect(eventos[1]).toEqual({
      tipo: 'PROPUESTA',
      alumno_id: alumnos.ana,
      nota_anterior: '5.5',
      nota_nueva: '6.0',
      responsable_id: await idDe(otroAyudante),
    })
    expect(await filasDe(evaluacion)).toEqual([
      expect.objectContaining({
        valor: '6.0',
        propuesta_por: await idDe(otroAyudante),
      }),
    ])
  })

  it('acepta una lista vacía sin cambiar nada', async () => {
    const evaluacion = await crearEvaluacion()
    const respuesta = await guardar(AYUDANTE, evaluacion, { notas: [] }, 200)

    expect(respuesta.alumnos).toHaveLength(5)
    expect(await filasDe(evaluacion)).toEqual([])
  })

  // El id en mayúsculas lo acepta ParseUUIDPipe: debe tomar el mismo lock.
  it.each([
    ['', (id: string) => id],
    [' (uno con el id en mayúsculas)', (id: string) => id.toUpperCase()],
  ])(
    'dos ayudantes que guardan a la vez quedan en orden%s: la auditoría encadena las notas',
    async (_caso, idDelSegundo) => {
      const evaluacion = await crearEvaluacion()
      await tokenDe(AYUDANTE)
      await tokenDe(otroAyudante)

      // Fija las inscripciones de la sección para que los dos guardados lleguen
      // a la vez: los dos esperan hasta el commit. Sin el lock por evaluación,
      // los dos leerían que el alumno no tiene nota y el segundo chocaría con
      // el índice único.
      const bloqueo = bd.createQueryRunner()
      await bloqueo.startTransaction()
      let guardados: Promise<unknown>[]
      try {
        await bloqueo.query(
          'SELECT id FROM inscripcion WHERE seccion_id = $1 FOR UPDATE',
          [secciones.s1],
        )
        guardados = [
          guardar(AYUDANTE, evaluacion, notasDe([[alumnos.bruno, 4.5]]), 200),
          guardar(
            otroAyudante,
            idDelSegundo(evaluacion),
            notasDe([[alumnos.bruno, 5]]),
            200,
          ),
        ]
        await esperarBloqueados(2)
      } finally {
        await bloqueo.commitTransaction()
        await bloqueo.release()
      }
      await Promise.all(guardados)

      const filas = await filasDe(evaluacion)
      expect(filas).toHaveLength(1)
      const eventos = await eventosDe(evaluacion)
      expect(eventos).toHaveLength(2)
      expect(eventos[0].nota_anterior).toBeNull()
      expect(eventos[1].nota_anterior).toBe(eventos[0].nota_nueva)
      expect(filas[0].valor).toBe(eventos[1].nota_nueva)
    },
  )

  // NOT-06: el 400 dice qué alumno tiene la nota inválida y por qué.
  it.each([
    ['0,9 (bajo 1,0)', 0.9, MENSAJES_NOTA_INVALIDA.rango],
    ['7,1 (sobre 7,0)', 7.1, MENSAJES_NOTA_INVALIDA.rango],
    ['8', 8, MENSAJES_NOTA_INVALIDA.rango],
    ['0', 0, MENSAJES_NOTA_INVALIDA.rango],
    ['5,55 (dos decimales)', 5.55, MENSAJES_NOTA_INVALIDA.formato],
    // Casi un decimal: la base los redondearía a 1,0 y 7,0.
    ['0,99999999999', 0.99999999999, MENSAJES_NOTA_INVALIDA.formato],
    ['7,00000000001', 7.00000000001, MENSAJES_NOTA_INVALIDA.formato],
    ['"x"', 'x', MENSAJES_NOTA_INVALIDA.formato],
    ['vacía', '', MENSAJES_NOTA_INVALIDA.formato],
    ['"5.5" (texto)', '5.5', MENSAJES_NOTA_INVALIDA.formato],
    ['nula', null, MENSAJES_NOTA_INVALIDA.formato],
    // JSON.stringify omite el undefined: la nota no viene.
    ['ausente', undefined, MENSAJES_NOTA_INVALIDA.formato],
  ])(
    'una nota %s responde 400 con el motivo por alumno, sin escribir filas ni eventos',
    async (_caso, nota, motivo) => {
      const evaluacion = await crearEvaluacion()
      const respuesta = await guardar(
        AYUDANTE,
        evaluacion,
        notasDe([[alumnos.ana, nota]]),
        400,
      )

      expect(respuesta).toEqual({
        statusCode: 400,
        message: 'Nota inválida',
        invalidas: [{ alumnoId: alumnos.ana, motivo }],
      } satisfies ErrorNotasInvalidas)
      expect(await filasDe(evaluacion)).toEqual([])
      expect(await eventosDe(evaluacion)).toEqual([])
    },
  )

  it.each([
    ['1,0', 1, '1.0'],
    ['7,0', 7, '7.0'],
    ['4,5', 4.5, '4.5'],
  ])('una nota de %s se guarda', async (_caso, nota, valor) => {
    const evaluacion = await crearEvaluacion()
    await guardar(AYUDANTE, evaluacion, notasDe([[alumnos.ana, nota]]), 200)
    expect(await filasDe(evaluacion)).toEqual([
      expect.objectContaining({ alumno_id: alumnos.ana, valor }),
    ])
  })

  it('una lista mixta no guarda nada y trae solo las inválidas, en orden', async () => {
    const evaluacion = await crearEvaluacion()
    const respuesta = await guardar(
      AYUDANTE,
      evaluacion,
      notasDe([
        [alumnos.ana, 6],
        [alumnos.zoe, 8],
        [alumnos.bruno, 4.5],
        [alumnos.carla, 'x'],
      ]),
      400,
    )

    expect(respuesta.invalidas).toEqual([
      { alumnoId: alumnos.zoe, motivo: MENSAJES_NOTA_INVALIDA.rango },
      { alumnoId: alumnos.carla, motivo: MENSAJES_NOTA_INVALIDA.formato },
    ])
    expect(await filasDe(evaluacion)).toEqual([])
    expect(await eventosDe(evaluacion)).toEqual([])
  })

  it('una nota inválida junto a un cuerpo mal formado responde el 400 de validación', async () => {
    const evaluacion = await crearEvaluacion()
    const respuesta = await guardar(
      AYUDANTE,
      evaluacion,
      notasDe([
        ['no-es-uuid', 5],
        [alumnos.ana, 8],
      ]),
      400,
    )

    expect(respuesta).not.toHaveProperty('invalidas')
    expect(respuesta.message).toEqual(
      expect.arrayContaining([expect.stringContaining('alumnoId')]),
    )
    expect(await filasDe(evaluacion)).toEqual([])
  })

  it.each([
    [
      'una lista de listas',
      () => ({ notas: [[{ alumnoId: alumnos.ana, nota: 5 }]] }),
    ],
    [
      'una fila nula junto a una nota inválida',
      () => ({ notas: [null, { alumnoId: alumnos.ana, nota: 8 }] }),
    ],
    [
      'más de 500 notas inválidas',
      () =>
        notasDe(
          Array.from(
            { length: MAX_NOTAS_GUARDADO + 1 },
            (): [string, unknown] => [alumnos.ana, 8],
          ),
        ),
    ],
  ])(
    '%s responde el 400 de validación, sin invalidas',
    async (_caso, cuerpo) => {
      const evaluacion = await crearEvaluacion()
      const respuesta = await guardar(AYUDANTE, evaluacion, cuerpo(), 400)

      expect(respuesta).not.toHaveProperty('invalidas')
      expect(Array.isArray(respuesta.message)).toBe(true)
      expect(await filasDe(evaluacion)).toEqual([])
      expect(await eventosDe(evaluacion)).toEqual([])
    },
  )

  it('una nota inválida después de una que ya existía tampoco cambia la existente', async () => {
    const evaluacion = await crearEvaluacion()
    await guardar(AYUDANTE, evaluacion, notasDe([[alumnos.ana, 5]]), 200)

    await guardar(
      AYUDANTE,
      evaluacion,
      notasDe([
        [alumnos.ana, 6],
        [alumnos.zoe, 0],
      ]),
      400,
    )

    expect(await filasDe(evaluacion)).toEqual([
      expect.objectContaining({ alumno_id: alumnos.ana, valor: '5.0' }),
    ])
    expect(await eventosDe(evaluacion)).toHaveLength(1)
  })

  it.each([
    ['no inscrito', () => alumnos.noInscrito],
    ['con la inscripción archivada', () => alumnos.retirado],
  ])(
    'un alumno %s responde 400 con sus ids y no guarda nada',
    async (_caso, alumno) => {
      const evaluacion = await crearEvaluacion()
      const respuesta = await guardar(
        AYUDANTE,
        evaluacion,
        notasDe([
          [alumnos.ana, 6],
          [alumno(), 5],
        ]),
        400,
      )

      expect(respuesta).toMatchObject({ sobrantes: [alumno()], repetidos: [] })
      expect(await filasDe(evaluacion)).toEqual([])
      expect(await eventosDe(evaluacion)).toEqual([])
    },
  )

  it('un alumno repetido responde 400 (también en mayúsculas)', async () => {
    const evaluacion = await crearEvaluacion()
    const respuesta = await guardar(
      AYUDANTE,
      evaluacion,
      notasDe([
        [alumnos.ana, 6],
        [alumnos.ana.toUpperCase(), 5],
      ]),
      400,
    )

    expect(respuesta).toMatchObject({ sobrantes: [], repetidos: [alumnos.ana] })
    expect(await filasDe(evaluacion)).toEqual([])
  })

  it('acepta el UUID de un alumno en mayúsculas', async () => {
    const evaluacion = await crearEvaluacion()
    await guardar(
      AYUDANTE,
      evaluacion,
      notasDe([[alumnos.ana.toUpperCase(), 6]]),
      200,
    )
    expect(await filasDe(evaluacion)).toEqual([
      expect.objectContaining({ alumno_id: alumnos.ana }),
    ])
  })

  it.each([
    ['sin notas', {}],
    ['notas que no es una lista', { notas: 'x' }],
    ['un alumnoId que no es UUID', { notas: [{ alumnoId: 'x', nota: 5 }] }],
    ['un campo extra', { notas: [], alumnoId: NO_EXISTE }],
    [
      'un campo extra en una nota',
      { notas: [{ alumnoId: NO_EXISTE, nota: 5, estado: 'PUBLICADA' }] },
    ],
  ])('un cuerpo %s responde 400', async (_caso, cuerpo) => {
    const evaluacion = await crearEvaluacion()
    await guardar(AYUDANTE, evaluacion, cuerpo, 400)
    expect(await filasDe(evaluacion)).toEqual([])
  })

  it('una lista de más de 500 notas responde 400 antes de llegar al servicio', async () => {
    const evaluacion = await crearEvaluacion()
    const lista = (largo: number) =>
      notasDe(
        Array.from({ length: largo }, (): [string, unknown] => [NO_EXISTE, 5]),
      )

    // Con 500 la lista llega al servicio, que la rechaza por sus alumnos.
    expect(
      await guardar(AYUDANTE, evaluacion, lista(MAX_NOTAS_GUARDADO), 400),
    ).toMatchObject({ sobrantes: [NO_EXISTE] })
    // Con 501 la rechaza la validación del cuerpo (ArrayMaxSize).
    const respuesta = await guardar(
      AYUDANTE,
      evaluacion,
      lista(MAX_NOTAS_GUARDADO + 1),
      400,
    )
    expect(respuesta.message).toEqual([
      expect.stringContaining(String(MAX_NOTAS_GUARDADO)),
    ])
    expect(respuesta).not.toHaveProperty('sobrantes')
    expect(await filasDe(evaluacion)).toEqual([])
    expect(await eventosDe(evaluacion)).toEqual([])
  })

  it('una nota publicada no se cambia desde aquí', async () => {
    const evaluacion = await crearEvaluacion()
    await insertarDirecto(evaluacion, {
      alumno_id: alumnos.ana,
      valor: 6,
      estado: 'PUBLICADA',
    })

    await guardar(AYUDANTE, evaluacion, notasDe([[alumnos.ana, 3]]), 400)

    expect(await filasDe(evaluacion)).toEqual([
      expect.objectContaining({ valor: '6.0', estado: 'PUBLICADA' }),
    ])
    expect(await eventosDe(evaluacion)).toEqual([])
  })

  it('una nota publicada en la lista rechaza todas antes de escribir, también las nuevas que van antes', async () => {
    const evaluacion = await crearEvaluacion()
    await insertarDirecto(evaluacion, {
      alumno_id: alumnos.ana,
      valor: 6,
      estado: 'PUBLICADA',
    })

    // Un trigger que aborta cualquier escritura en nota o nota_cambio de esta
    // evaluación: si el servicio escribiera la nota de Bruno antes de ver la
    // publicada (aunque luego se revierta), respondería 500 y no 400.
    await bd.query(`CREATE FUNCTION test_sin_escrituras_nota() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'escritura inesperada'; END $$`)
    for (const tabla of ['nota', 'nota_cambio']) {
      await bd.query(`CREATE TRIGGER test_sin_escrituras_nota
        BEFORE INSERT OR UPDATE ON ${tabla}
        FOR EACH ROW WHEN (NEW.evaluacion_id = '${evaluacion}')
        EXECUTE FUNCTION test_sin_escrituras_nota()`)
    }
    try {
      const respuesta = await guardar(
        AYUDANTE,
        evaluacion,
        notasDe([
          [alumnos.bruno, 5],
          [alumnos.ana, 3],
        ]),
        400,
      )
      expect(respuesta.message).toBe(
        'Una nota publicada no se cambia desde aquí',
      )
    } finally {
      for (const tabla of ['nota', 'nota_cambio']) {
        await bd.query(`DROP TRIGGER test_sin_escrituras_nota ON ${tabla}`)
      }
      await bd.query('DROP FUNCTION test_sin_escrituras_nota()')
    }

    // Ni la nota nueva de Bruno ni un evento; la publicada, intacta.
    expect(await filasDe(evaluacion)).toEqual([
      expect.objectContaining({
        alumno_id: alumnos.ana,
        valor: '6.0',
        estado: 'PUBLICADA',
      }),
    ])
    expect(await eventosDe(evaluacion)).toEqual([])
  })

  it('si el UPDATE no modifica la nota no responde 200 ni deja cambios', async () => {
    const evaluacion = await crearEvaluacion()
    await guardar(AYUDANTE, evaluacion, notasDe([[alumnos.ana, 5]]), 200)
    const filas = await filasDe(evaluacion)
    const eventos = await eventosDe(evaluacion)

    // Un trigger que omite el UPDATE de las notas de esta evaluación simula
    // un UPDATE que no alcanza la fila (por la RLS u otra razón).
    await bd.query(`CREATE FUNCTION test_omitir_update_nota() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$`)
    await bd.query(`CREATE TRIGGER test_omitir_update_nota BEFORE UPDATE ON nota
      FOR EACH ROW WHEN (OLD.evaluacion_id = '${evaluacion}')
      EXECUTE FUNCTION test_omitir_update_nota()`)
    try {
      await guardar(
        AYUDANTE,
        evaluacion,
        notasDe([
          [alumnos.bruno, 4],
          [alumnos.ana, 6],
        ]),
        500,
      )
    } finally {
      await bd.query('DROP TRIGGER test_omitir_update_nota ON nota')
      await bd.query('DROP FUNCTION test_omitir_update_nota()')
    }

    // Ni la nota nueva de Bruno, ni otro evento.
    expect(await filasDe(evaluacion)).toEqual(filas)
    expect(await eventosDe(evaluacion)).toEqual(eventos)
  })

  it.each([
    ['el profesor de la sección', PROFESOR, 403],
    ['un alumno inscrito', ALUMNO, 403],
    ['el Administrativo de la facultad', ADMIN_INGENIERIA, 403],
    ['el Director (solo lectura)', DIRECTOR, 403],
    ['un ayudante de otra sección', () => ayudanteOtraSeccion, 403],
    // CASL responde antes que el guard de la sección: un profesor no tiene
    // update sobre Nota en ninguna universidad.
    ['un profesor de otra universidad', PROFESOR_SUR, 403],
    ['un ayudante de otra universidad', AYUDANTE_SUR, 404],
  ])('%s no guarda notas (%#)', async (_caso, correo, estado) => {
    const evaluacion = await crearEvaluacion()
    await guardar(
      typeof correo === 'function' ? correo() : correo,
      evaluacion,
      notasDe([[alumnos.ana, 6]]),
      estado,
    )
    expect(await filasDe(evaluacion)).toEqual([])
    expect(await eventosDe(evaluacion)).toEqual([])
  })

  it('un ayudante al que le quitaron la sección ya no guarda', async () => {
    const evaluacion = await crearEvaluacion()
    const correo = otroAyudante
    await tokenDe(correo)
    await bd.query(
      `UPDATE ayudante_seccion SET archived_at = now()
        WHERE seccion_id = $1 AND usuario_id = $2`,
      [secciones.s1, await idDe(correo)],
    )
    try {
      await guardar(correo, evaluacion, notasDe([[alumnos.ana, 6]]), 403)
      expect(await filasDe(evaluacion)).toEqual([])
    } finally {
      await bd.query(
        `UPDATE ayudante_seccion SET archived_at = NULL
          WHERE seccion_id = $1 AND usuario_id = $2`,
        [secciones.s1, await idDe(correo)],
      )
    }
  })

  it.each([
    ['de otra sección', () => crearEvaluacion(secciones.s2)],
    ['archivada', () => crearEvaluacion(secciones.s1, { archivada: true })],
    ['que no existe', () => Promise.resolve(NO_EXISTE)],
  ])('una evaluación %s responde 404', async (_caso, evaluacion) => {
    await guardar(
      AYUDANTE,
      await evaluacion(),
      notasDe([[alumnos.ana, 6]]),
      404,
    )
  })
})

describe('el alumno no ve las propuestas en sus endpoints (NOT-05)', () => {
  it('ni las evaluaciones, ni el resumen de la sección, ni su dashboard incluyen notas', async () => {
    const evaluacion = await crearEvaluacion()
    await guardar(AYUDANTE, evaluacion, notasDe([[alumnos.base, 6.7]]), 200)
    const token = await tokenDe(ALUMNO)

    for (const ruta of [
      `/api/espacio/secciones/${secciones.s1}/evaluaciones`,
      `/api/espacio/secciones/${secciones.s1}/resumen`,
      '/api/dashboard/secciones-alumno',
    ]) {
      const respuesta = await request(app.getHttpServer())
        .get(ruta)
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
      const cuerpo = JSON.stringify(respuesta.body)
      expect(cuerpo).not.toMatch(/"(nota|notas|valor|estado)"/)
      expect(cuerpo).not.toContain('PROPUESTA')
      expect(cuerpo).not.toContain('6.7')
    }
  })
})

describe('GET .../mis-notas (NOT-13)', () => {
  const rutaMisNotas = (seccionId: string) =>
    `/api/espacio/secciones/${seccionId}/mis-notas`

  async function misNotas(
    correo: string,
    estado: number,
    seccionId = secciones.s1,
  ) {
    const token = await tokenDe(correo)
    const respuesta = await request(app.getHttpServer())
      .get(rutaMisNotas(seccionId))
      .set('Authorization', `Bearer ${token}`)
      .expect(estado)
    return respuesta.body as MisNotasSeccion
  }

  it('cada evaluación activa con su fecha y ponderación, y solo la nota publicada del alumno', async () => {
    const publicada = await crearEvaluacion()
    await insertarDirecto(publicada, {
      alumno_id: alumnos.base,
      valor: 6.5,
      estado: 'PUBLICADA',
    })
    await insertarDirecto(publicada, {
      alumno_id: alumnos.ana,
      valor: 2,
      estado: 'PUBLICADA',
    })
    const propuesta = await crearEvaluacion()
    await insertarDirecto(propuesta, { alumno_id: alumnos.base, valor: 5.5 })
    await insertarRevision(propuesta, 'EN_REVISION')
    const devuelta = await crearEvaluacion()
    await insertarDirecto(devuelta, { alumno_id: alumnos.base, valor: 4.5 })
    await insertarRevision(devuelta, 'DEVUELTA')
    const sinNota = await crearEvaluacion()
    const archivada = await crearEvaluacion(secciones.s1, { archivada: true })
    const deOtraSeccion = await crearEvaluacion(secciones.s2)

    const { evaluaciones } = await misNotas(ALUMNO, 200)
    const porId = new Map(evaluaciones.map((e) => [e.evaluacionId, e]))

    const [fila] = await bd.query<
      { nombre: string; fecha: string; ponderacion: number }[]
    >(
      `SELECT nombre, to_char(fecha, 'YYYY-MM-DD') AS fecha, ponderacion
         FROM evaluacion WHERE id = $1`,
      [publicada],
    )
    expect(porId.get(publicada)).toEqual({
      evaluacionId: publicada,
      ...fila,
      nota: 6.5,
    })
    for (const id of [propuesta, devuelta, sinNota]) {
      expect(porId.get(id)?.nota).toBeNull()
    }
    expect(porId.has(archivada)).toBe(false)
    expect(porId.has(deOtraSeccion)).toBe(false)

    // Las mismas evaluaciones activas de la sección y en el mismo orden que
    // la lista de evaluaciones; las notas, solo las publicadas del alumno.
    const esperadas = await bd.query<{ id: string; nota: number | null }[]>(
      `SELECT e.id, n.valor::float8 AS nota FROM evaluacion e
         LEFT JOIN nota n ON n.evaluacion_id = e.id AND n.alumno_id = $2
                         AND n.estado = 'PUBLICADA' AND n.archived_at IS NULL
        WHERE e.seccion_id = $1 AND e.archived_at IS NULL
        ORDER BY e.fecha, e.nombre, e.id`,
      [secciones.s1, alumnos.base],
    )
    expect(evaluaciones.map((e) => [e.evaluacionId, e.nota])).toEqual(
      esperadas.map((e) => [e.id, e.nota]),
    )
    const cuerpo = JSON.stringify(evaluaciones)
    expect(cuerpo).not.toContain(alumnos.ana)
    expect(cuerpo).not.toMatch(/"(estado|alumnoId|alumnos)"/)
  })

  it('una sección sin evaluaciones responde una lista vacía', async () => {
    const [vacia] = await bd.query<{ id: string }[]>(
      `INSERT INTO seccion (universidad_id, curso_id, numero)
       SELECT universidad_id, curso_id, 99 FROM seccion WHERE id = $1
       RETURNING id`,
      [secciones.s1],
    )
    await inscribir(vacia.id, alumnos.base)

    expect(await misNotas(ALUMNO, 200, vacia.id)).toEqual({ evaluaciones: [] })
  })

  it.each([
    ['el profesor de la sección', PROFESOR, 403],
    ['un ayudante de la sección', AYUDANTE, 403],
    ['el Administrativo de la facultad', ADMIN_INGENIERIA, 403],
    ['un alumno de otra universidad', 'alumno@sur.cursus.test', 404],
  ])('%s no consulta mis-notas (%#)', async (_caso, correo, estado) => {
    await misNotas(correo, estado)
  })

  it('un alumno que no está inscrito en la sección responde 403', async () => {
    await misNotas(ALUMNO, 403, secciones.s2)
  })

  // Decisión de NOT-13: sin inscripción activa no ve sus notas, como en
  // mi-asistencia (ASI-06).
  it('un alumno con la inscripción archivada responde 403', async () => {
    await bd.query(
      `UPDATE inscripcion SET archived_at = now(), archivada_por = $3
        WHERE seccion_id = $1 AND usuario_id = $2 AND archived_at IS NULL`,
      [secciones.s1, alumnos.base, await idDe(ADMIN_INGENIERIA)],
    )
    try {
      await misNotas(ALUMNO, 403)
    } finally {
      await bd.query(
        `UPDATE inscripcion SET archived_at = NULL, archivada_por = NULL
          WHERE id = (SELECT id FROM inscripcion
                       WHERE seccion_id = $1 AND usuario_id = $2
                       ORDER BY archived_at DESC NULLS LAST LIMIT 1)`,
        [secciones.s1, alumnos.base],
      )
    }
  })

  it('sin sesión responde 401', async () => {
    await request(app.getHttpServer())
      .get(rutaMisNotas(secciones.s1))
      .expect(401)
  })
})

describe('restricciones de nota (NOT-05)', () => {
  it.each([
    ['una nota sobre 7,0', { valor: 7.5 }],
    ['una nota bajo 1,0', { valor: 0.9 }],
    ['un estado fuera de la lista', { estado: 'DEVUELTA' }],
  ])('rechaza %s (CHECK)', async (_caso, columnas) => {
    await expect(
      insertarDirecto(await crearEvaluacion(), columnas),
    ).rejects.toMatchObject({ driverError: { code: CHECK } })
  })

  it('rechaza un alumno de otra universidad (FK compuesta)', async () => {
    await expect(
      insertarDirecto(await crearEvaluacion(), {
        alumno_id: await idDe('alumno@sur.cursus.test'),
      }),
    ).rejects.toMatchObject({ driverError: { code: FOREIGN_KEY } })
  })

  it('una sola nota activa por alumno en cada evaluación', async () => {
    const evaluacion = await crearEvaluacion()
    await insertarDirecto(evaluacion, {})
    await expect(insertarDirecto(evaluacion, {})).rejects.toMatchObject({
      driverError: { code: '23505' },
    })
    // Archivada, deja ingresar otra.
    await bd.query(
      'UPDATE nota SET archived_at = now() WHERE evaluacion_id = $1',
      [evaluacion],
    )
    await insertarDirecto(evaluacion, {})
  })
})

describe('RLS de nota (NOT-05)', () => {
  // Una propuesta y una nota publicada del alumno del seed, propias de este
  // bloque: no depende de los anteriores.
  let evaluacion = ''
  beforeAll(async () => {
    evaluacion = await crearEvaluacion()
    await insertarDirecto(evaluacion, { alumno_id: alumnos.ana, valor: 5 })
    await insertarDirecto(evaluacion, {
      alumno_id: alumnos.base,
      valor: 6,
      estado: 'PUBLICADA',
    })
  })

  it.each<Rol>(['PROFESOR', 'AYUDANTE'])(
    'el %s de la universidad las lee',
    async (rol) => {
      await comoApp({ universidadId: ids.norte, rol }, async (q) => {
        const filas = await q.query<unknown[]>(
          'SELECT id FROM nota WHERE evaluacion_id = $1',
          [evaluacion],
        )
        expect(filas).toHaveLength(2)
      })
    },
  )

  it('el Director las lee en cualquier universidad', async () => {
    await comoApp({ universidadId: ids.sur, rol: 'DIRECTOR' }, async (q) => {
      const filas = await q.query<unknown[]>(
        'SELECT id FROM nota WHERE evaluacion_id = $1',
        [evaluacion],
      )
      expect(filas).toHaveLength(2)
    })
  })

  // NOT-13: el ALUMNO lee solo sus notas publicadas, y solo si la API fija
  // quién es (app.usuario_id).
  it('el ALUMNO ve solo su nota publicada, no la propuesta de otro (NOT-13)', async () => {
    await comoApp(
      { universidadId: ids.norte, rol: 'ALUMNO', usuarioId: alumnos.base },
      async (q) => {
        const filas = await q.query<{ alumno_id: string; estado: string }[]>(
          'SELECT alumno_id, estado FROM nota WHERE evaluacion_id = $1',
          [evaluacion],
        )
        expect(filas).toEqual([
          { alumno_id: alumnos.base, estado: 'PUBLICADA' },
        ])
        // En ninguna evaluación ve una propuesta ni una nota de otro alumno.
        const ajenas = await q.query<unknown[]>(
          `SELECT id FROM nota
            WHERE alumno_id <> $1 OR estado <> 'PUBLICADA' OR archived_at IS NOT NULL`,
          [alumnos.base],
        )
        expect(ajenas).toEqual([])
      },
    )
  })

  it('el ALUMNO no ve su propuesta ni su nota archivada (NOT-13)', async () => {
    const otra = await crearEvaluacion()
    await insertarDirecto(otra, { alumno_id: alumnos.base, valor: 4 })
    const archivada = await crearEvaluacion()
    await insertarDirecto(archivada, {
      alumno_id: alumnos.base,
      valor: 3,
      estado: 'PUBLICADA',
      archived_at: new Date(),
    })

    await comoApp(
      { universidadId: ids.norte, rol: 'ALUMNO', usuarioId: alumnos.base },
      async (q) => {
        expect(
          await q.query(
            'SELECT id FROM nota WHERE evaluacion_id = ANY($1::uuid[])',
            [[otra, archivada]],
          ),
        ).toEqual([])
      },
    )
  })

  it('el ALUMNO sin usuario de sesión no ve ninguna fila (NOT-13)', async () => {
    await comoApp({ universidadId: ids.norte, rol: 'ALUMNO' }, async (q) => {
      expect(await q.query('SELECT * FROM nota')).toEqual([])
    })
  })

  it('el ALUMNO de otra universidad no ve las de Norte (NOT-13)', async () => {
    await comoApp(
      { universidadId: ids.sur, rol: 'ALUMNO', usuarioId: alumnos.base },
      async (q) => {
        expect(await q.query('SELECT * FROM nota')).toEqual([])
      },
    )
  })

  it('otro rol con el id del alumno no hereda su lectura (NOT-13)', async () => {
    await comoApp(
      {
        universidadId: ids.norte,
        rol: 'ADMINISTRATIVO',
        usuarioId: alumnos.base,
      },
      async (q) => {
        expect(await q.query('SELECT * FROM nota')).toEqual([])
      },
    )
  })

  it('el ADMINISTRATIVO no ve ninguna fila', async () => {
    await comoApp(
      { universidadId: ids.norte, rol: 'ADMINISTRATIVO' },
      async (q) => {
        expect(await q.query('SELECT * FROM nota')).toEqual([])
      },
    )
  })

  it('desde otra universidad no se ven las de Norte', async () => {
    await comoApp({ universidadId: ids.sur, rol: 'AYUDANTE' }, async (q) => {
      expect(await q.query('SELECT * FROM nota')).toEqual([])
    })
  })

  // Las FKs no miran la RLS: la condición universidad_id = universidad_actual()
  // de la política es la única barrera de la base entre universidades.
  it('un AYUDANTE no inserta notas de otra universidad ni mueve las suyas a otra', async () => {
    await comoApp({ universidadId: ids.sur, rol: 'AYUDANTE' }, async (q) => {
      await expect(
        q.query(
          `INSERT INTO nota (universidad_id, evaluacion_id, alumno_id, valor, propuesta_por)
           VALUES ($1, $2, $3, 4, $4)`,
          [ids.norte, evaluacion, alumnos.carla, await idDe(AYUDANTE)],
        ),
      ).rejects.toMatchObject({ driverError: { code: SIN_PERMISO } })
    })
    await comoApp({ universidadId: ids.norte, rol: 'AYUDANTE' }, async (q) => {
      await expect(
        q.query(
          `UPDATE nota SET universidad_id = $1
            WHERE evaluacion_id = $2 AND alumno_id = $3`,
          [ids.sur, evaluacion, alumnos.ana],
        ),
      ).rejects.toMatchObject({ driverError: { code: SIN_PERMISO } })
    })
  })

  it.each<Rol>(['ALUMNO', 'PROFESOR', 'ADMINISTRATIVO', 'DIRECTOR'])(
    'el %s no puede insertar',
    async (rol) => {
      await comoApp({ universidadId: ids.norte, rol }, async (q) => {
        await expect(
          q.query(
            `INSERT INTO nota (universidad_id, evaluacion_id, alumno_id, valor, propuesta_por)
             VALUES ($1, $2, $3, 4, $4)`,
            [ids.norte, evaluacion, alumnos.zoe, await idDe(AYUDANTE)],
          ),
        ).rejects.toMatchObject({ driverError: { code: SIN_PERMISO } })
      })
    },
  )

  it('el ayudante sí inserta (control positivo)', async () => {
    await comoApp({ universidadId: ids.norte, rol: 'AYUDANTE' }, async (q) => {
      await q.query(
        `INSERT INTO nota (universidad_id, evaluacion_id, alumno_id, valor, propuesta_por)
         VALUES ($1, $2, $3, 4, $4)`,
        [ids.norte, evaluacion, alumnos.zoe, await idDe(AYUDANTE)],
      )
    })
  })

  it('el AYUDANTE no puede insertar una nota PUBLICADA (RLS)', async () => {
    await comoApp({ universidadId: ids.norte, rol: 'AYUDANTE' }, async (q) => {
      await expect(
        q.query(
          `INSERT INTO nota (universidad_id, evaluacion_id, alumno_id, valor, estado, propuesta_por)
           VALUES ($1, $2, $3, 4, 'PUBLICADA', $4)`,
          [ids.norte, evaluacion, alumnos.carla, await idDe(AYUDANTE)],
        ),
      ).rejects.toMatchObject({
        driverError: {
          code: SIN_PERMISO,
          message: expect.stringContaining('row-level security') as unknown,
        },
      })
    })
  })

  it('el AYUDANTE no puede publicar una propuesta (RLS)', async () => {
    await comoApp({ universidadId: ids.norte, rol: 'AYUDANTE' }, async (q) => {
      await expect(
        q.query(
          `UPDATE nota SET estado = 'PUBLICADA'
            WHERE evaluacion_id = $1 AND alumno_id = $2`,
          [evaluacion, alumnos.ana],
        ),
      ).rejects.toMatchObject({
        driverError: {
          code: SIN_PERMISO,
          message: expect.stringContaining('row-level security') as unknown,
        },
      })
    })
  })

  // Una fila que no pasa el USING de la política no se modifica: PostgreSQL
  // la omite sin error, así que se verifica que el UPDATE no la alcanza.
  it('el AYUDANTE no puede modificar una nota PUBLICADA: el UPDATE no la alcanza', async () => {
    await comoApp({ universidadId: ids.norte, rol: 'AYUDANTE' }, async (q) => {
      const [, modificadas] = await q.query<[unknown[], number]>(
        `UPDATE nota SET valor = 2
          WHERE evaluacion_id = $1 AND alumno_id = $2 RETURNING id`,
        [evaluacion, alumnos.base],
      )
      expect(modificadas).toBe(0)
      // Control positivo: la propuesta de la misma evaluación sí se modifica.
      const [, propuestas] = await q.query<[unknown[], number]>(
        `UPDATE nota SET valor = 2
          WHERE evaluacion_id = $1 AND alumno_id = $2 RETURNING id`,
        [evaluacion, alumnos.ana],
      )
      expect(propuestas).toBe(1)
    })
    expect(await filasDe(evaluacion)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          alumno_id: alumnos.base,
          valor: '6.0',
          estado: 'PUBLICADA',
        }),
      ]),
    )
  })

  it('el ALUMNO no puede modificar notas: el UPDATE no alcanza ninguna fila', async () => {
    await comoApp({ universidadId: ids.norte, rol: 'ALUMNO' }, async (q) => {
      const [, modificadas] = await q.query<[unknown[], number]>(
        `UPDATE nota SET valor = 7 WHERE evaluacion_id = $1 RETURNING id`,
        [evaluacion],
      )
      expect(modificadas).toBe(0)
    })
    expect((await filasDe(evaluacion)).map((f) => f.valor).sort()).toEqual([
      '5.0',
      '6.0',
    ])
  })

  it('cursus_app no tiene DELETE sobre nota', async () => {
    const [{ puede }] = await bd.query<{ puede: boolean }[]>(
      `SELECT has_table_privilege($1, 'nota', 'DELETE') AS puede`,
      [ROL_APP],
    )
    expect(puede).toBe(false)
    await comoApp({ universidadId: ids.norte, rol: 'AYUDANTE' }, async (q) => {
      await expect(q.query('DELETE FROM nota')).rejects.toMatchObject({
        driverError: { code: SIN_PERMISO },
      })
    })
  })

  it('no hay ruta DELETE', async () => {
    const token = await tokenDe(AYUDANTE)
    await request(app.getHttpServer())
      .delete(ruta(secciones.s1, evaluacion))
      .set('Authorization', `Bearer ${token}`)
      .expect(404)
  })
})

// NOT-07: estado de las notas de una evaluación (revision_notas), como dueño
// de la tabla.
const revisionDe = (evaluacionId: string) =>
  bd.query<{ estado: string; actualizado_por: string }[]>(
    `SELECT estado, actualizado_por FROM revision_notas
      WHERE evaluacion_id = $1`,
    [evaluacionId],
  )

const insertarRevision = async (evaluacionId: string, estado = 'BORRADOR') =>
  bd.query<unknown>(
    `INSERT INTO revision_notas (universidad_id, evaluacion_id, estado, actualizado_por)
     VALUES ($1, $2, $3, $4)`,
    [ids.norte, evaluacionId, estado, await idDe(AYUDANTE)],
  )

describe('borrador de notas (NOT-07)', () => {
  it.each([
    ['el ayudante', AYUDANTE],
    ['el profesor', PROFESOR],
    ['el Director de otra universidad', DIRECTOR_SUR],
  ])(
    'una evaluación sin fila en revision_notas responde BORRADOR a %s',
    async (_caso, correo) => {
      const evaluacion = await crearEvaluacion()
      expect((await leer(correo, evaluacion, 200)).estado).toBe('BORRADOR')
      expect(await revisionDe(evaluacion)).toEqual([])
    },
  )

  it('el estado se lee de revision_notas (LEFT JOIN), no es fijo', async () => {
    const evaluacion = await crearEvaluacion()
    await insertarRevision(evaluacion, 'EN_REVISION')
    expect((await leer(PROFESOR, evaluacion, 200)).estado).toBe('EN_REVISION')
  })

  it('guardar aunque falten alumnos deja un borrador y al volver se recuperan las notas', async () => {
    const evaluacion = await crearEvaluacion()
    const ayudante = await idDe(AYUDANTE)

    const guardadas = await guardar(
      AYUDANTE,
      evaluacion,
      notasDe([[alumnos.ana, 5.5]]),
      200,
    )
    expect(guardadas.estado).toBe('BORRADOR')
    expect(await revisionDe(evaluacion)).toEqual([
      { estado: 'BORRADOR', actualizado_por: ayudante },
    ])

    const releidas = await leer(AYUDANTE, evaluacion, 200)
    expect(releidas.estado).toBe('BORRADOR')
    expect(
      releidas.alumnos.filter((a) => a.nota !== null).map((a) => a.id),
    ).toEqual([alumnos.ana])

    // Otro guardado, de otro ayudante, no crea otra fila ni la cambia.
    await guardar(otroAyudante, evaluacion, notasDe([[alumnos.zoe, 4]]), 200)
    expect(await revisionDe(evaluacion)).toEqual([
      { estado: 'BORRADOR', actualizado_por: ayudante },
    ])
    // Solo eventos PROPUESTA: guardar un borrador no envía a revisión.
    expect((await eventosDe(evaluacion)).map((e) => e.tipo)).toEqual([
      'PROPUESTA',
      'PROPUESTA',
    ])
  })

  it('el profesor lee los valores del borrador, en estado BORRADOR (no pendiente)', async () => {
    const evaluacion = await crearEvaluacion()
    await guardar(AYUDANTE, evaluacion, notasDe([[alumnos.bruno, 6]]), 200)

    const notas = await leer(PROFESOR, evaluacion, 200)
    expect(notas.estado).toBe('BORRADOR')
    expect(notas.alumnos.find((a) => a.id === alumnos.bruno)?.nota).toBe(6)
  })

  it.each([
    ['una nota inválida', notasDe([[alumnos.ana, 8]]), 400],
    ['un alumno no inscrito', notasDe([[alumnos.noInscrito, 5]]), 400],
  ])(
    'un guardado rechazado por %s no crea el borrador',
    async (_caso, cuerpo, estado) => {
      const evaluacion = await crearEvaluacion()
      await guardar(AYUDANTE, evaluacion, cuerpo, estado)
      expect(await revisionDe(evaluacion)).toEqual([])
    },
  )

  it.each([
    ['el profesor', PROFESOR, 403],
    ['un ayudante de otra sección', () => ayudanteOtraSeccion, 403],
    ['un ayudante de otra universidad', AYUDANTE_SUR, 404],
  ])('%s no crea el borrador', async (_caso, correo, estado) => {
    const evaluacion = await crearEvaluacion()
    await guardar(
      typeof correo === 'function' ? correo() : correo,
      evaluacion,
      notasDe([[alumnos.ana, 5]]),
      estado,
    )
    expect(await revisionDe(evaluacion)).toEqual([])
  })

  it('dos PUT a la vez sobre una evaluación sin fila crean una sola fila', async () => {
    const evaluacion = await crearEvaluacion()
    await tokenDe(AYUDANTE)
    await tokenDe(otroAyudante)

    // Como en NOT-05: las inscripciones fijadas hacen que los dos lleguen a la
    // vez, sin que ninguno haya creado la fila.
    const bloqueo = bd.createQueryRunner()
    await bloqueo.startTransaction()
    let guardados: Promise<unknown>[]
    try {
      await bloqueo.query(
        'SELECT id FROM inscripcion WHERE seccion_id = $1 FOR UPDATE',
        [secciones.s1],
      )
      guardados = [
        guardar(AYUDANTE, evaluacion, notasDe([[alumnos.ana, 4.5]]), 200),
        guardar(otroAyudante, evaluacion, notasDe([[alumnos.zoe, 5]]), 200),
      ]
      await esperarBloqueados(2)
    } finally {
      await bloqueo.commitTransaction()
      await bloqueo.release()
    }
    await Promise.all(guardados)

    expect(await revisionDe(evaluacion)).toHaveLength(1)
    expect(await filasDe(evaluacion)).toHaveLength(2)
  })

  it('el alumno no ve el estado: 403 en el GET y nada en sus endpoints', async () => {
    const evaluacion = await crearEvaluacion()
    await guardar(AYUDANTE, evaluacion, notasDe([[alumnos.base, 6.7]]), 200)
    await leer(ALUMNO, evaluacion, 403)
    const token = await tokenDe(ALUMNO)

    for (const ruta of [
      `/api/espacio/secciones/${secciones.s1}/evaluaciones`,
      `/api/espacio/secciones/${secciones.s1}/resumen`,
      '/api/dashboard/secciones-alumno',
    ]) {
      const respuesta = await request(app.getHttpServer())
        .get(ruta)
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
      expect(JSON.stringify(respuesta.body)).not.toContain('BORRADOR')
    }
  })
})

describe('restricciones de revision_notas (NOT-07)', () => {
  it('rechaza un estado que no es de NOT-09', async () => {
    await expect(
      insertarRevision(await crearEvaluacion(), 'PUBLICADA'),
    ).rejects.toMatchObject({ driverError: { code: CHECK } })
  })

  it('una sola fila por evaluación', async () => {
    const evaluacion = await crearEvaluacion()
    await insertarRevision(evaluacion)
    await expect(insertarRevision(evaluacion)).rejects.toMatchObject({
      driverError: { code: UNIQUE },
    })
  })

  it('rechaza una evaluación de otra universidad (FK compuesta)', async () => {
    const evaluacion = await crearEvaluacion()
    await expect(
      bd.query(
        `INSERT INTO revision_notas (universidad_id, evaluacion_id, actualizado_por)
         VALUES ($1, $2, $3)`,
        [ids.sur, evaluacion, await idDe(AYUDANTE_SUR)],
      ),
    ).rejects.toMatchObject({ driverError: { code: FOREIGN_KEY } })
  })
})

describe('RLS de revision_notas (NOT-07)', () => {
  let evaluacion = ''
  beforeAll(async () => {
    evaluacion = await crearEvaluacion()
    await insertarRevision(evaluacion)
  })

  const insertar = async (
    q: QueryRunner,
    estado = 'BORRADOR',
  ): Promise<unknown> =>
    q.query(
      `INSERT INTO revision_notas (universidad_id, evaluacion_id, estado, actualizado_por)
       VALUES ($1, $2, $3, $4)`,
      [ids.norte, await crearEvaluacion(), estado, await idDe(AYUDANTE)],
    )

  it.each<Rol>(['PROFESOR', 'AYUDANTE'])(
    'el %s de la universidad la lee',
    async (rol) => {
      await comoApp({ universidadId: ids.norte, rol }, async (q) => {
        const filas = await q.query<unknown[]>(
          'SELECT id FROM revision_notas WHERE evaluacion_id = $1',
          [evaluacion],
        )
        expect(filas).toHaveLength(1)
      })
    },
  )

  it('el Director la lee en cualquier universidad', async () => {
    await comoApp({ universidadId: ids.sur, rol: 'DIRECTOR' }, async (q) => {
      const filas = await q.query<unknown[]>(
        'SELECT id FROM revision_notas WHERE evaluacion_id = $1',
        [evaluacion],
      )
      expect(filas).toHaveLength(1)
    })
  })

  it.each<[string, string, Rol]>([
    ['el ALUMNO', 'norte', 'ALUMNO'],
    ['el ADMINISTRATIVO', 'norte', 'ADMINISTRATIVO'],
    ['el PROFESOR de otra universidad', 'sur', 'PROFESOR'],
    ['el AYUDANTE de otra universidad', 'sur', 'AYUDANTE'],
  ])('%s ve 0 filas', async (_caso, universidad, rol) => {
    await comoApp(
      { universidadId: universidad === 'norte' ? ids.norte : ids.sur, rol },
      async (q) => {
        expect(await q.query('SELECT id FROM revision_notas')).toEqual([])
      },
    )
  })

  it('el ayudante inserta un borrador (control positivo)', async () => {
    await comoApp({ universidadId: ids.norte, rol: 'AYUDANTE' }, (q) =>
      insertar(q).then(() => undefined),
    )
  })

  it.each<Rol>(['PROFESOR', 'ALUMNO', 'ADMINISTRATIVO', 'DIRECTOR'])(
    'el %s no puede insertar',
    async (rol) => {
      await comoApp({ universidadId: ids.norte, rol }, async (q) => {
        await expect(insertar(q)).rejects.toMatchObject({
          driverError: { code: SIN_PERMISO },
        })
      })
    },
  )

  it.each(['EN_REVISION', 'APROBADA', 'DEVUELTA'])(
    'el ayudante no puede insertar en %s',
    async (estado) => {
      await comoApp(
        { universidadId: ids.norte, rol: 'AYUDANTE' },
        async (q) => {
          await expect(insertar(q, estado)).rejects.toMatchObject({
            driverError: { code: SIN_PERMISO },
          })
        },
      )
    },
  )

  it('un ayudante de otra universidad no inserta en Norte', async () => {
    await comoApp({ universidadId: ids.sur, rol: 'AYUDANTE' }, async (q) => {
      await expect(insertar(q)).rejects.toMatchObject({
        driverError: { code: SIN_PERMISO },
      })
    })
  })

  it.each<Rol>([
    'AYUDANTE',
    'PROFESOR',
    'DIRECTOR',
    'ALUMNO',
    'ADMINISTRATIVO',
  ])('el %s no puede hacer DELETE', async (rol) => {
    await comoApp({ universidadId: ids.norte, rol }, async (q) => {
      await expect(
        q.query('DELETE FROM revision_notas WHERE evaluacion_id = $1', [
          evaluacion,
        ]),
      ).rejects.toMatchObject({ driverError: { code: SIN_PERMISO } })
    })
  })

  // NOT-08: el UPDATE es solo del ayudante (ver RLS del envío).
  it.each<Rol>(['PROFESOR', 'DIRECTOR', 'ALUMNO', 'ADMINISTRATIVO'])(
    'el UPDATE del %s no alcanza la fila',
    async (rol) => {
      await comoApp({ universidadId: ids.norte, rol }, async (q) => {
        const [, modificadas] = await q.query<[unknown[], number]>(
          `UPDATE revision_notas SET estado = 'EN_REVISION'
            WHERE evaluacion_id = $1 RETURNING id`,
          [evaluacion],
        )
        expect(modificadas).toBe(0)
      })
      expect(await revisionDe(evaluacion)).toEqual([
        expect.objectContaining({ estado: 'BORRADOR' }),
      ])
    },
  )
})

// NOT-08: envío a revisión.
async function enviar(
  correo: string,
  evaluacionId: string,
  estado: number,
  seccionId = secciones.s1,
) {
  const token = await tokenDe(correo)
  const respuesta = await request(app.getHttpServer())
    .post(`${ruta(seccionId, evaluacionId)}/envio`)
    .set('Authorization', `Bearer ${token}`)
    .expect(estado)
  return respuesta.body as NotasEvaluacion &
    Partial<ErrorNotasFaltantes> & { message: string }
}

// Los cinco alumnos activos de s1 (el retirado no cuenta).
const ACTIVOS = () => [
  alumnos.base,
  alumnos.ana,
  alumnos.bruno,
  alumnos.carla,
  alumnos.zoe,
]

// Una evaluación nueva con nota para todos los activos de s1.
async function evaluacionCompleta() {
  const evaluacion = await crearEvaluacion()
  await guardar(
    AYUDANTE,
    evaluacion,
    notasDe(ACTIVOS().map((id) => [id, 5])),
    200,
  )
  return evaluacion
}

// Deja la evaluación en el estado dado, como dueño de la tabla.
const fijarEstado = async (evaluacionId: string, estado: string) =>
  bd.query<unknown>(
    `INSERT INTO revision_notas (universidad_id, evaluacion_id, estado, actualizado_por)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (evaluacion_id) DO UPDATE SET estado = EXCLUDED.estado`,
    [ids.norte, evaluacionId, estado, await idDe(AYUDANTE)],
  )

const enviosDe = (evaluacionId: string) =>
  bd.query<{ alumno_id: string | null; responsable_id: string; fecha: Date }[]>(
    `SELECT alumno_id, responsable_id, fecha FROM nota_cambio
      WHERE evaluacion_id = $1 AND tipo = 'ENVIO'`,
    [evaluacionId],
  )

describe('POST .../notas/envio (NOT-08)', () => {
  it('con todas las notas pasa a EN_REVISION y deja un evento ENVIO con fecha y ayudante', async () => {
    const evaluacion = await evaluacionCompleta()
    const ayudante = await idDe(AYUDANTE)
    // El evento y esta referencia usan el mismo reloj, el de PostgreSQL.
    const [{ antes }] = await bd.query<{ antes: Date }[]>(
      'SELECT clock_timestamp() AS antes',
    )

    const enviada = await enviar(AYUDANTE, evaluacion, 200)
    expect(enviada.estado).toBe('EN_REVISION')
    expect(enviada.alumnos.every((a) => a.nota === 5)).toBe(true)
    expect(await revisionDe(evaluacion)).toEqual([
      { estado: 'EN_REVISION', actualizado_por: ayudante },
    ])
    const envios = await enviosDe(evaluacion)
    expect(envios).toHaveLength(1)
    expect(envios[0]).toMatchObject({
      alumno_id: null,
      responsable_id: ayudante,
    })
    expect(envios[0].fecha.getTime()).toBeGreaterThanOrEqual(antes.getTime())
    expect((await leer(PROFESOR, evaluacion, 200)).estado).toBe('EN_REVISION')
  })

  it('con una nota faltante responde 400 con los que faltan y no cambia nada', async () => {
    const evaluacion = await crearEvaluacion()
    await guardar(
      AYUDANTE,
      evaluacion,
      notasDe(
        ACTIVOS()
          .slice(0, 3)
          .map((id) => [id, 6]),
      ),
      200,
    )

    const error = await enviar(AYUDANTE, evaluacion, 400)
    expect(error.message).toBe('Faltan notas')
    expect([...(error.faltantes ?? [])].sort()).toEqual(
      ACTIVOS().slice(3).sort(),
    )
    expect(await revisionDe(evaluacion)).toEqual([
      expect.objectContaining({ estado: 'BORRADOR' }),
    ])
    expect(await enviosDe(evaluacion)).toEqual([])
  })

  it('sin ninguna nota faltan todos los activos, sin el alumno retirado', async () => {
    const evaluacion = await crearEvaluacion()
    const error = await enviar(AYUDANTE, evaluacion, 400)
    expect([...(error.faltantes ?? [])].sort()).toEqual(ACTIVOS().sort())
    expect(await revisionDe(evaluacion)).toEqual([])
  })

  it('un segundo envío responde 409 y deja un solo evento', async () => {
    const evaluacion = await evaluacionCompleta()
    await enviar(AYUDANTE, evaluacion, 200)
    const error = await enviar(otroAyudante, evaluacion, 409)
    expect(error.message).toBe('Las notas están en revisión')
    expect(await enviosDe(evaluacion)).toHaveLength(1)
  })

  it('una evaluación aprobada responde 409', async () => {
    const evaluacion = await evaluacionCompleta()
    await fijarEstado(evaluacion, 'APROBADA')
    const error = await enviar(AYUDANTE, evaluacion, 409)
    expect(error.message).toBe('Las notas ya fueron aprobadas')
    expect(await enviosDe(evaluacion)).toEqual([])
  })

  it('una evaluación devuelta se puede volver a enviar', async () => {
    const evaluacion = await evaluacionCompleta()
    await fijarEstado(evaluacion, 'DEVUELTA')
    expect((await enviar(AYUDANTE, evaluacion, 200)).estado).toBe('EN_REVISION')
    expect(await enviosDe(evaluacion)).toHaveLength(1)
  })

  it('envía también si las notas no pasaron por el PUT (sin fila en revision_notas)', async () => {
    const evaluacion = await crearEvaluacion()
    for (const id of ACTIVOS()) {
      await insertarDirecto(evaluacion, { alumno_id: id, valor: 4 })
    }
    expect((await enviar(AYUDANTE, evaluacion, 200)).estado).toBe('EN_REVISION')
  })

  it.each([
    ['en revisión', 'EN_REVISION', 'Las notas están en revisión'],
    ['aprobada', 'APROBADA', 'Las notas ya fueron aprobadas'],
  ])(
    'el PUT de notas de una evaluación %s responde 409 y no cambia las notas',
    async (_caso, estado, mensaje) => {
      const evaluacion = await evaluacionCompleta()
      await fijarEstado(evaluacion, estado)
      const error = await guardar(
        AYUDANTE,
        evaluacion,
        notasDe([[alumnos.ana, 7]]),
        409,
      )
      expect(error.message).toBe(mensaje)
      expect(
        (await filasDe(evaluacion)).find((f) => f.alumno_id === alumnos.ana)
          ?.valor,
      ).toBe('5.0')
      expect(
        (await eventosDe(evaluacion)).filter((e) => e.nota_nueva === '7.0'),
      ).toEqual([])
    },
  )

  it('el PUT de una evaluación devuelta guarda', async () => {
    const evaluacion = await evaluacionCompleta()
    await fijarEstado(evaluacion, 'DEVUELTA')
    await guardar(AYUDANTE, evaluacion, notasDe([[alumnos.ana, 7]]), 200)
  })

  it.each([
    ['el profesor de la sección', PROFESOR, 403],
    ['un alumno inscrito', ALUMNO, 403],
    ['el Administrativo', ADMIN_INGENIERIA, 403],
    ['el Director', DIRECTOR, 403],
    ['un ayudante de otra sección', () => ayudanteOtraSeccion, 403],
    ['un ayudante de otra universidad', AYUDANTE_SUR, 404],
  ])('%s no envía (%#)', async (_caso, correo, estado) => {
    const evaluacion = await evaluacionCompleta()
    await enviar(
      typeof correo === 'function' ? correo() : correo,
      evaluacion,
      estado,
    )
    expect(await revisionDe(evaluacion)).toEqual([
      expect.objectContaining({ estado: 'BORRADOR' }),
    ])
    expect(await enviosDe(evaluacion)).toEqual([])
  })

  it.each([
    ['de otra sección', () => crearEvaluacion(secciones.s2)],
    ['archivada', () => crearEvaluacion(secciones.s1, { archivada: true })],
    ['que no existe', () => Promise.resolve(NO_EXISTE)],
  ])('una evaluación %s responde 404', async (_caso, evaluacion) => {
    await enviar(AYUDANTE, await evaluacion(), 404)
  })

  it('una sección sin alumnos activos responde 400 y no cambia nada', async () => {
    // s2 sin inscripciones activas durante esta prueba.
    const [archivadas] = await bd.query<[{ id: string }[], number]>(
      `UPDATE inscripcion SET archived_at = now(), archivada_por = $2
        WHERE seccion_id = $1 AND archived_at IS NULL RETURNING id`,
      [secciones.s2, await idDe(ADMIN_INGENIERIA)],
    )
    try {
      const evaluacion = await crearEvaluacion(secciones.s2)
      const error = await enviar(
        ayudanteOtraSeccion,
        evaluacion,
        400,
        secciones.s2,
      )
      expect(error.message).toBe('La sección no tiene alumnos inscritos')
      expect(await revisionDe(evaluacion)).toEqual([])
      expect(await enviosDe(evaluacion)).toEqual([])
    } finally {
      await bd.query(
        `UPDATE inscripcion SET archived_at = NULL, archivada_por = NULL
          WHERE id = ANY($1)`,
        [archivadas.map((a) => a.id)],
      )
    }
  })

  it('el UPDATE del ayudante no cambia la evaluación de la fila (GRANT por columna)', async () => {
    const evaluacion = await crearEvaluacion()
    await fijarEstado(evaluacion, 'BORRADOR')
    await comoApp({ universidadId: ids.norte, rol: 'AYUDANTE' }, async (q) => {
      await expect(
        q.query(
          `UPDATE revision_notas SET evaluacion_id = $2 WHERE evaluacion_id = $1`,
          [evaluacion, await crearEvaluacion()],
        ),
      ).rejects.toMatchObject({ driverError: { code: SIN_PERMISO } })
    })
  })

  it('dos envíos a la vez dejan un solo evento: uno responde 200 y el otro 409', async () => {
    const evaluacion = await evaluacionCompleta()
    await tokenDe(AYUDANTE)
    await tokenDe(otroAyudante)

    const bloqueo = bd.createQueryRunner()
    await bloqueo.startTransaction()
    let envios: Promise<unknown>[]
    try {
      await bloqueo.query(
        'SELECT id FROM inscripcion WHERE seccion_id = $1 FOR UPDATE',
        [secciones.s1],
      )
      const token = (correo: string) => tokenDe(correo)
      envios = [AYUDANTE, otroAyudante].map(async (correo) =>
        request(app.getHttpServer())
          .post(`${ruta(secciones.s1, evaluacion)}/envio`)
          .set('Authorization', `Bearer ${await token(correo)}`)
          .then((r) => r.status),
      )
      await esperarBloqueados(2)
    } finally {
      await bloqueo.commitTransaction()
      await bloqueo.release()
    }
    expect((await Promise.all(envios)).sort()).toEqual([200, 409])
    expect(await enviosDe(evaluacion)).toHaveLength(1)
  })
})

describe('RLS del envío a revisión (NOT-08)', () => {
  // Filas modificadas: la RLS omite sin error las que no alcanza.
  const actualizarRevision = async (
    q: QueryRunner,
    evaluacion: string,
    estado: string,
  ): Promise<number> => {
    const [, filas] = await q.query<[unknown[], number]>(
      `UPDATE revision_notas SET estado = $2 WHERE evaluacion_id = $1 RETURNING id`,
      [evaluacion, estado],
    )
    return Number(filas)
  }

  it.each(['BORRADOR', 'DEVUELTA'])(
    'el AYUDANTE pasa de %s a EN_REVISION',
    async (desde) => {
      const evaluacion = await crearEvaluacion()
      await fijarEstado(evaluacion, desde)
      await comoApp(
        { universidadId: ids.norte, rol: 'AYUDANTE' },
        async (q) => {
          expect(await actualizarRevision(q, evaluacion, 'EN_REVISION')).toBe(1)
        },
      )
    },
  )

  it.each(['APROBADA', 'DEVUELTA', 'BORRADOR'])(
    'el AYUDANTE no puede pasar un borrador a %s',
    async (hacia) => {
      const evaluacion = await crearEvaluacion()
      await fijarEstado(evaluacion, 'BORRADOR')
      await comoApp(
        { universidadId: ids.norte, rol: 'AYUDANTE' },
        async (q) => {
          await expect(
            actualizarRevision(q, evaluacion, hacia),
          ).rejects.toMatchObject({ driverError: { code: SIN_PERMISO } })
        },
      )
    },
  )

  it.each(['EN_REVISION', 'APROBADA'])(
    'el UPDATE del AYUDANTE no alcanza una evaluación %s',
    async (desde) => {
      const evaluacion = await crearEvaluacion()
      await fijarEstado(evaluacion, desde)
      await comoApp(
        { universidadId: ids.norte, rol: 'AYUDANTE' },
        async (q) => {
          expect(await actualizarRevision(q, evaluacion, 'EN_REVISION')).toBe(0)
        },
      )
    },
  )

  it('un AYUDANTE de otra universidad no envía las de Norte', async () => {
    const evaluacion = await crearEvaluacion()
    await fijarEstado(evaluacion, 'BORRADOR')
    await comoApp({ universidadId: ids.sur, rol: 'AYUDANTE' }, async (q) => {
      expect(await actualizarRevision(q, evaluacion, 'EN_REVISION')).toBe(0)
    })
    expect(await revisionDe(evaluacion)).toEqual([
      expect.objectContaining({ estado: 'BORRADOR' }),
    ])
  })

  // Las notas del AYUDANTE como cursus_app, según el estado de la evaluación
  // (sin fila es un borrador).
  const insertarNota = async (
    q: QueryRunner,
    evaluacion: string,
  ): Promise<unknown> =>
    q.query<unknown>(
      `INSERT INTO nota (universidad_id, evaluacion_id, alumno_id, valor, propuesta_por)
       VALUES ($1, $2, $3, 4, $4)`,
      [ids.norte, evaluacion, alumnos.zoe, await idDe(AYUDANTE)],
    )
  const actualizarNota = async (
    q: QueryRunner,
    evaluacion: string,
  ): Promise<number> => {
    const [, filas] = await q.query<[unknown[], number]>(
      `UPDATE nota SET valor = 6 WHERE evaluacion_id = $1 AND alumno_id = $2
           RETURNING id`,
      [evaluacion, alumnos.ana],
    )
    return Number(filas)
  }

  async function evaluacionEn(estado: string | null) {
    const evaluacion = await crearEvaluacion()
    await insertarDirecto(evaluacion, { alumno_id: alumnos.ana, valor: 5 })
    if (estado) await fijarEstado(evaluacion, estado)
    return evaluacion
  }

  it.each([null, 'BORRADOR', 'DEVUELTA'])(
    'en %s el AYUDANTE inserta y modifica notas',
    async (estado) => {
      const evaluacion = await evaluacionEn(estado)
      await comoApp(
        { universidadId: ids.norte, rol: 'AYUDANTE' },
        async (q) => {
          await insertarNota(q, evaluacion)
          expect(await actualizarNota(q, evaluacion)).toBe(1)
        },
      )
    },
  )

  it.each(['EN_REVISION', 'APROBADA'])(
    'en %s el INSERT del AYUDANTE falla y su UPDATE no alcanza filas',
    async (estado) => {
      const evaluacion = await evaluacionEn(estado)
      await comoApp(
        { universidadId: ids.norte, rol: 'AYUDANTE' },
        async (q) => {
          await expect(insertarNota(q, evaluacion)).rejects.toMatchObject({
            driverError: { code: SIN_PERMISO },
          })
        },
      )
      await comoApp(
        { universidadId: ids.norte, rol: 'AYUDANTE' },
        async (q) => {
          expect(await actualizarNota(q, evaluacion)).toBe(0)
        },
      )
      expect((await filasDe(evaluacion)).map((f) => f.valor)).toEqual(['5.0'])
    },
  )
})

async function aprobar(
  correo: string,
  evaluacionId: string,
  estado: number,
  seccionId = secciones.s1,
) {
  const token = await tokenDe(correo)
  const respuesta = await request(app.getHttpServer())
    .post(`${ruta(seccionId, evaluacionId)}/aprobacion`)
    .set('Authorization', `Bearer ${token}`)
    .expect(estado)
  return respuesta.body as NotasEvaluacion & {
    message: string
    estado?: string
  }
}

// Una evaluación con nota para todos los activos de s1, enviada a revisión.
async function evaluacionEnRevision() {
  const evaluacion = await evaluacionCompleta()
  await enviar(AYUDANTE, evaluacion, 200)
  return evaluacion
}

const eventosAprobacionDe = (evaluacionId: string) =>
  bd.query<
    {
      tipo: string
      alumno_id: string | null
      nota_anterior: string | null
      nota_nueva: string | null
      responsable_id: string
      fecha: Date
    }[]
  >(
    `SELECT tipo, alumno_id, nota_anterior, nota_nueva, responsable_id, fecha
       FROM nota_cambio
      WHERE evaluacion_id = $1 AND tipo IN ('PUBLICACION', 'APROBACION')
      ORDER BY tipo, alumno_id`,
    [evaluacionId],
  )

const otroProfesorDeNorte = async () =>
  (
    await bd.query<{ id: string; correo: string }[]>(
      `SELECT id, correo FROM usuario
        WHERE universidad_id = $1 AND rol = 'PROFESOR' AND correo <> $2
        ORDER BY correo LIMIT 1`,
      [ids.norte, PROFESOR],
    )
  )[0]

describe('POST .../notas/aprobacion (NOT-11)', () => {
  it('publica todas las notas, aprueba la revisión y deja la auditoría con fecha y profesor', async () => {
    const evaluacion = await evaluacionEnRevision()
    const profesor = await idDe(PROFESOR)
    // NOT-02 solo bloquea la nota final. La publicación de una evaluación
    // debe seguir funcionando con ponderaciones distintas de 100 %.
    const [{ suma }] = await bd.query<{ suma: number }[]>(
      `SELECT sum(ponderacion)::int AS suma FROM evaluacion
        WHERE seccion_id = $1 AND archived_at IS NULL`,
      [secciones.s1],
    )
    expect(suma).not.toBe(100)
    const [{ antes }] = await bd.query<{ antes: Date }[]>(
      'SELECT clock_timestamp() AS antes',
    )

    const aprobada = await aprobar(PROFESOR, evaluacion, 200)

    expect(aprobada.estado).toBe('APROBADA')
    expect(aprobada.alumnos.map((a) => [a.nota, a.estado])).toEqual(
      ACTIVOS().map(() => [5, 'PUBLICADA']),
    )
    expect((await filasDe(evaluacion)).map((f) => f.estado)).toEqual(
      ACTIVOS().map(() => 'PUBLICADA'),
    )
    expect(await revisionDe(evaluacion)).toEqual([
      { estado: 'APROBADA', actualizado_por: profesor },
    ])
    const eventos = await eventosAprobacionDe(evaluacion)
    // Un APROBACION de la evaluación y un PUBLICACION por nota.
    expect(
      eventos.map((e) => ({
        tipo: e.tipo,
        alumno_id: e.alumno_id,
        nota_anterior: e.nota_anterior,
        nota_nueva: e.nota_nueva,
        responsable_id: e.responsable_id,
      })),
    ).toEqual([
      {
        tipo: 'APROBACION',
        alumno_id: null,
        nota_anterior: null,
        nota_nueva: null,
        responsable_id: profesor,
      },
      ...[...ACTIVOS()].sort().map((alumno) => ({
        tipo: 'PUBLICACION',
        alumno_id: alumno,
        nota_anterior: null,
        nota_nueva: '5.0',
        responsable_id: profesor,
      })),
    ])
    for (const evento of eventos) {
      expect(evento.fecha.getTime()).toBeGreaterThanOrEqual(antes.getTime())
    }
  })

  it.each([
    [null, 'Las notas aún no se envían a revisión'],
    ['BORRADOR', 'Las notas aún no se envían a revisión'],
    ['DEVUELTA', 'Las notas fueron devueltas al ayudante'],
    ['APROBADA', 'Las notas ya fueron aprobadas'],
  ])(
    'en %s responde 409 sin publicar ni dejar eventos',
    async (estado, mensaje) => {
      const evaluacion = await evaluacionCompleta()
      if (estado) await fijarEstado(evaluacion, estado)

      const respuesta = await aprobar(PROFESOR, evaluacion, 409)

      // El 409 de estado lo trae: el cliente saca la evaluación de pendientes.
      expect(respuesta).toMatchObject({
        message: mensaje,
        estado: estado ?? 'BORRADOR',
      })
      expect(
        (await filasDe(evaluacion)).every((f) => f.estado === 'PROPUESTA'),
      ).toBe(true)
      expect(await eventosAprobacionDe(evaluacion)).toEqual([])
    },
  )

  it('una segunda aprobación responde 409 y no duplica la auditoría', async () => {
    const evaluacion = await evaluacionEnRevision()
    await aprobar(PROFESOR, evaluacion, 200)
    const respuesta = await aprobar(PROFESOR, evaluacion, 409)
    expect(respuesta.message).toBe('Las notas ya fueron aprobadas')
    expect(await eventosAprobacionDe(evaluacion)).toHaveLength(
      ACTIVOS().length + 1,
    )
  })

  it('dos aprobaciones a la vez: una responde 200, la otra 409, y la auditoría queda una vez', async () => {
    const evaluacion = await evaluacionEnRevision()
    const token = await tokenDe(PROFESOR)

    // Ambas esperan el lock de la evaluación, que tiene este test.
    const bloqueo = bd.createQueryRunner()
    await bloqueo.startTransaction()
    let aprobaciones: Promise<number>[]
    try {
      await bloqueo.query(
        `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
        [`notas:${evaluacion}`],
      )
      aprobaciones = [0, 1].map(() =>
        request(app.getHttpServer())
          .post(`${ruta(secciones.s1, evaluacion)}/aprobacion`)
          .set('Authorization', `Bearer ${token}`)
          .then((r) => r.status),
      )
      await esperarBloqueados(2)
    } finally {
      await bloqueo.commitTransaction()
      await bloqueo.release()
    }
    expect((await Promise.all(aprobaciones)).sort()).toEqual([200, 409])
    const eventos = await eventosAprobacionDe(evaluacion)
    expect(eventos.filter((e) => e.tipo === 'APROBACION')).toHaveLength(1)
    expect(eventos.filter((e) => e.tipo === 'PUBLICACION')).toHaveLength(
      ACTIVOS().length,
    )
  })

  it('una nota que no está propuesta responde 409 sin publicar las demás', async () => {
    const evaluacion = await evaluacionEnRevision()
    // Inconsistente a propósito, como dueño de la tabla.
    await bd.query(
      `UPDATE nota SET estado = 'PUBLICADA'
        WHERE evaluacion_id = $1 AND alumno_id = $2`,
      [evaluacion, alumnos.ana],
    )

    const respuesta = await aprobar(PROFESOR, evaluacion, 409)

    // Sin estado: la evaluación sigue en revisión.
    expect(respuesta.message).toBe(
      'Hay notas que no están propuestas en la escala de 1,0 a 7,0',
    )
    expect(respuesta).not.toHaveProperty('estado')
    expect(
      (await filasDe(evaluacion)).filter((f) => f.estado === 'PROPUESTA'),
    ).toHaveLength(ACTIVOS().length - 1)
    expect(await revisionDe(evaluacion)).toEqual([
      expect.objectContaining({ estado: 'EN_REVISION' }),
    ])
    expect(await eventosAprobacionDe(evaluacion)).toEqual([])
  })

  it.each([AYUDANTE, ALUMNO, ADMIN_INGENIERIA, DIRECTOR])(
    '%s recibe 403 y no cambia nada',
    async (correo) => {
      const evaluacion = await evaluacionEnRevision()
      await aprobar(correo, evaluacion, 403)
      expect(await revisionDe(evaluacion)).toEqual([
        expect.objectContaining({ estado: 'EN_REVISION' }),
      ])
    },
  )

  it('un profesor que no es de la sección recibe 403', async () => {
    const evaluacion = await evaluacionEnRevision()
    await aprobar((await otroProfesorDeNorte()).correo, evaluacion, 403)
    expect(await eventosAprobacionDe(evaluacion)).toEqual([])
  })

  it('un profesor de otra universidad recibe 404', async () => {
    const evaluacion = await evaluacionEnRevision()
    await aprobar(PROFESOR_SUR, evaluacion, 404)
    expect(await eventosAprobacionDe(evaluacion)).toEqual([])
  })

  it('una evaluación archivada responde 404', async () => {
    const evaluacion = await evaluacionEnRevision()
    await bd.query('UPDATE evaluacion SET archived_at = now() WHERE id = $1', [
      evaluacion,
    ])
    await aprobar(PROFESOR, evaluacion, 404)
  })

  // Regresión (NOT-05 y NOT-08): las notas publicadas ya no se editan.
  it('después de aprobar, el ayudante no edita las notas publicadas', async () => {
    const evaluacion = await evaluacionEnRevision()
    await aprobar(PROFESOR, evaluacion, 200)

    const respuesta = await guardar(
      AYUDANTE,
      evaluacion,
      notasDe([[alumnos.ana, 7]]),
      409,
    )
    expect(respuesta.message).toBe('Las notas ya fueron aprobadas')
    await comoApp({ universidadId: ids.norte, rol: 'AYUDANTE' }, async (q) => {
      const [, filas] = await q.query<[unknown[], number]>(
        `UPDATE nota SET valor = 7 WHERE evaluacion_id = $1 RETURNING id`,
        [evaluacion],
      )
      expect(Number(filas)).toBe(0)
    })
    expect((await filasDe(evaluacion)).map((f) => f.valor)).toEqual(
      ACTIVOS().map(() => '5.0'),
    )
  })
})

describe('RLS de la aprobación (NOT-11)', () => {
  // Filas modificadas: la RLS omite sin error las que no alcanza.
  const publicar = async (
    q: QueryRunner,
    evaluacion: string,
    valor?: number,
  ): Promise<number> => {
    const [, filas] = await q.query<[unknown[], number]>(
      `UPDATE nota SET estado = 'PUBLICADA'${valor ? ', valor = $2' : ''}
        WHERE evaluacion_id = $1 RETURNING id`,
      valor ? [evaluacion, valor] : [evaluacion],
    )
    return Number(filas)
  }
  const aprobarRevision = async (
    q: QueryRunner,
    evaluacion: string,
    estado = 'APROBADA',
  ): Promise<number> => {
    // Como el servicio: a nombre de quien aprueba (sin usuario, el de antes).
    const [, filas] = await q.query<[unknown[], number]>(
      `UPDATE revision_notas
          SET estado = $2,
              actualizado_por = COALESCE(usuario_actual(), actualizado_por)
        WHERE evaluacion_id = $1 RETURNING id`,
      [evaluacion, estado],
    )
    return Number(filas)
  }
  const comoProfesor = async (
    prueba: (q: QueryRunner) => Promise<void>,
    usuarioId?: string,
  ) =>
    comoApp(
      {
        universidadId: ids.norte,
        rol: 'PROFESOR',
        usuarioId: usuarioId ?? (await idDe(PROFESOR)),
      },
      prueba,
    )

  it('el profesor de la sección publica las notas y aprueba la revisión (control positivo)', async () => {
    const evaluacion = await evaluacionEnRevision()
    await comoProfesor(async (q) => {
      expect(await publicar(q, evaluacion)).toBe(ACTIVOS().length)
      expect(await aprobarRevision(q, evaluacion)).toBe(1)
    })
  })

  it('el AYUDANTE no publica: 42501', async () => {
    const evaluacion = await evaluacionCompleta()
    await comoApp({ universidadId: ids.norte, rol: 'AYUDANTE' }, async (q) => {
      await expect(publicar(q, evaluacion)).rejects.toMatchObject({
        driverError: { code: SIN_PERMISO },
      })
    })
  })

  it('el AYUDANTE no aprueba la revisión: su UPDATE no la alcanza', async () => {
    const evaluacion = await evaluacionEnRevision()
    await comoApp({ universidadId: ids.norte, rol: 'AYUDANTE' }, async (q) => {
      expect(await aprobarRevision(q, evaluacion)).toBe(0)
    })
  })

  it('otro profesor de la universidad no alcanza filas', async () => {
    const evaluacion = await evaluacionEnRevision()
    const otro = (await otroProfesorDeNorte()).id
    await comoProfesor(async (q) => {
      expect(await publicar(q, evaluacion)).toBe(0)
      expect(await aprobarRevision(q, evaluacion)).toBe(0)
    }, otro)
  })

  it('sin usuario en la sesión el profesor no alcanza filas', async () => {
    const evaluacion = await evaluacionEnRevision()
    await comoApp({ universidadId: ids.norte, rol: 'PROFESOR' }, async (q) => {
      expect(await publicar(q, evaluacion)).toBe(0)
      expect(await aprobarRevision(q, evaluacion)).toBe(0)
    })
  })

  it('desde otra universidad no alcanza filas de Norte', async () => {
    const evaluacion = await evaluacionEnRevision()
    await comoApp(
      {
        universidadId: ids.sur,
        rol: 'PROFESOR',
        usuarioId: await idDe(PROFESOR_SUR),
      },
      async (q) => {
        expect(await publicar(q, evaluacion)).toBe(0)
        expect(await aprobarRevision(q, evaluacion)).toBe(0)
      },
    )
  })

  it.each([null, 'BORRADOR', 'DEVUELTA', 'APROBADA'])(
    'en %s el profesor no publica',
    async (estado) => {
      const evaluacion = await evaluacionCompleta()
      if (estado) await fijarEstado(evaluacion, estado)
      await comoProfesor(async (q) => {
        expect(await publicar(q, evaluacion)).toBe(0)
      })
    },
  )

  it('publicar no cambia el valor (trigger)', async () => {
    const evaluacion = await evaluacionEnRevision()
    await comoProfesor(async (q) => {
      await expect(publicar(q, evaluacion, 7)).rejects.toMatchObject({
        driverError: { code: CHECK },
      })
    })
  })

  it.each([
    ['archivarla', 'archived_at = now()'],
    ['cambiar quién la propuso', 'propuesta_por = $2'],
  ])('publicar no permite además %s (trigger)', async (_caso, cambio) => {
    const evaluacion = await evaluacionEnRevision()
    await comoProfesor(async (q) => {
      await expect(
        q.query(
          `UPDATE nota SET estado = 'PUBLICADA', ${cambio} WHERE evaluacion_id = $1`,
          cambio.includes('$2')
            ? [evaluacion, await idDe(PROFESOR)]
            : [evaluacion],
        ),
      ).rejects.toMatchObject({ driverError: { code: CHECK } })
    })
  })

  it('el profesor no aprueba a nombre de otro usuario: 42501', async () => {
    const evaluacion = await evaluacionEnRevision()
    await comoProfesor(async (q) => {
      await expect(
        q.query(
          `UPDATE revision_notas SET estado = 'APROBADA', actualizado_por = $2
            WHERE evaluacion_id = $1`,
          [evaluacion, await idDe(AYUDANTE)],
        ),
      ).rejects.toMatchObject({ driverError: { code: SIN_PERMISO } })
    })
  })

  it.each(['DEVUELTA', 'BORRADOR'])(
    'el profesor no pasa la revisión a %s (aún no hay devolución)',
    async (hacia) => {
      const evaluacion = await evaluacionEnRevision()
      await comoProfesor(async (q) => {
        await expect(
          aprobarRevision(q, evaluacion, hacia),
        ).rejects.toMatchObject({ driverError: { code: SIN_PERMISO } })
      })
    },
  )

  it('una nota publicada no vuelve a propuesta', async () => {
    const evaluacion = await evaluacionEnRevision()
    await aprobar(PROFESOR, evaluacion, 200)
    await comoProfesor(async (q) => {
      const [, filas] = await q.query<[unknown[], number]>(
        `UPDATE nota SET estado = 'PROPUESTA' WHERE evaluacion_id = $1 RETURNING id`,
        [evaluacion],
      )
      expect(Number(filas)).toBe(0)
    })
  })
})

const COMENTARIO = 'Revisa la pregunta 3 de Ana'

async function devolver(
  correo: string,
  evaluacionId: string,
  estado: number,
  cuerpo: unknown = { comentario: COMENTARIO },
  seccionId = secciones.s1,
) {
  const token = await tokenDe(correo)
  const respuesta = await request(app.getHttpServer())
    .post(`${ruta(seccionId, evaluacionId)}/devolucion`)
    .set('Authorization', `Bearer ${token}`)
    .send(cuerpo as object)
    .expect(estado)
  return respuesta.body as NotasEvaluacion & {
    message: string | string[]
    estado?: string
  }
}

const devolucionDe = (evaluacionId: string) =>
  bd.query<
    {
      estado: string
      actualizado_por: string
      comentario_devolucion: string | null
    }[]
  >(
    `SELECT estado, actualizado_por, comentario_devolucion FROM revision_notas
      WHERE evaluacion_id = $1`,
    [evaluacionId],
  )

// Eventos de toda la evaluación (sin PROPUESTA), en orden.
const vueltasDe = (evaluacionId: string) =>
  bd.query<
    {
      tipo: string
      responsable_id: string
      motivo: string | null
      fecha: Date
    }[]
  >(
    `SELECT tipo, responsable_id, motivo, fecha FROM nota_cambio
      WHERE evaluacion_id = $1 AND tipo <> 'PROPUESTA'
      ORDER BY fecha, id`,
    [evaluacionId],
  )

describe('POST .../notas/devolucion (NOT-12)', () => {
  it('pasa a DEVUELTA con el comentario, deja las notas en PROPUESTA y registra DEVOLUCION con fecha, profesor y comentario', async () => {
    const evaluacion = await evaluacionEnRevision()
    const profesor = await idDe(PROFESOR)
    const [{ antes }] = await bd.query<{ antes: Date }[]>(
      'SELECT clock_timestamp() AS antes',
    )

    const devuelta = await devolver(PROFESOR, evaluacion, 200, {
      comentario: `  ${COMENTARIO}\n  `,
    })

    expect(devuelta.estado).toBe('DEVUELTA')
    expect(devuelta.alumnos.every((a) => a.estado === 'PROPUESTA')).toBe(true)
    expect(
      (await filasDe(evaluacion)).every((f) => f.estado === 'PROPUESTA'),
    ).toBe(true)
    // Sin los espacios de los extremos.
    expect(await devolucionDe(evaluacion)).toEqual([
      {
        estado: 'DEVUELTA',
        actualizado_por: profesor,
        comentario_devolucion: COMENTARIO,
      },
    ])
    const vueltas = await vueltasDe(evaluacion)
    expect(vueltas.map((v) => [v.tipo, v.motivo])).toEqual([
      ['ENVIO', null],
      ['DEVOLUCION', COMENTARIO],
    ])
    expect(vueltas[1].responsable_id).toBe(profesor)
    expect(vueltas[1].fecha.getTime()).toBeGreaterThanOrEqual(antes.getTime())
  })

  it.each([
    [null, 'Las notas aún no se envían a revisión'],
    ['BORRADOR', 'Las notas aún no se envían a revisión'],
    ['DEVUELTA', 'Las notas fueron devueltas al ayudante'],
    ['APROBADA', 'Las notas ya fueron aprobadas'],
  ])(
    'en %s responde 409 con el estado y no cambia nada',
    async (estado, mensaje) => {
      const evaluacion = await evaluacionCompleta()
      if (estado) await fijarEstado(evaluacion, estado)

      const respuesta = await devolver(PROFESOR, evaluacion, 409)

      expect(respuesta).toMatchObject({
        message: mensaje,
        estado: estado ?? 'BORRADOR',
      })
      expect(
        (await vueltasDe(evaluacion)).filter((v) => v.tipo === 'DEVOLUCION'),
      ).toEqual([])
    },
  )

  it.each([
    ['sin comentario', {}],
    ['vacío', { comentario: '' }],
    ['de solo espacios', { comentario: '   \n ' }],
    ['que no es texto', { comentario: 5 }],
    ['de más de 500 caracteres', { comentario: 'a'.repeat(501) }],
    // Cada "❤️" son dos caracteres para PostgreSQL (con el selector de
    // variante): 1000, aunque @MaxLength contaría 500.
    [
      'de 500 emojis con selector de variante',
      { comentario: '❤️'.repeat(500) },
    ],
    ['con un carácter de control', { comentario: 'Revisa\u0007' }],
    ['con campos de más', { comentario: COMENTARIO, estado: 'BORRADOR' }],
  ])(
    'un comentario %s responde 400 y no cambia nada',
    async (_caso, cuerpo) => {
      const evaluacion = await evaluacionEnRevision()

      await devolver(PROFESOR, evaluacion, 400, cuerpo)

      expect(await devolucionDe(evaluacion)).toEqual([
        expect.objectContaining({
          estado: 'EN_REVISION',
          comentario_devolucion: null,
        }),
      ])
    },
  )

  it('acepta 500 caracteres contados como PostgreSQL, con emojis', async () => {
    const evaluacion = await evaluacionEnRevision()
    const comentario = '❤'.repeat(250) + '😀'.repeat(250)
    await devolver(PROFESOR, evaluacion, 200, { comentario })
    expect((await devolucionDe(evaluacion))[0].comentario_devolucion).toBe(
      comentario,
    )
  })

  it('acepta 500 caracteres y saltos de línea', async () => {
    const evaluacion = await evaluacionEnRevision()
    const comentario = `Primera línea\n${'a'.repeat(486)}`
    expect(comentario).toHaveLength(500)
    await devolver(PROFESOR, evaluacion, 200, { comentario })
    expect((await devolucionDe(evaluacion))[0].comentario_devolucion).toBe(
      comentario,
    )
  })

  it.each([AYUDANTE, ALUMNO, ADMIN_INGENIERIA, DIRECTOR])(
    '%s recibe 403 y no cambia nada',
    async (correo) => {
      const evaluacion = await evaluacionEnRevision()
      await devolver(correo, evaluacion, 403)
      expect((await devolucionDe(evaluacion))[0].estado).toBe('EN_REVISION')
    },
  )

  it('un profesor que no es de la sección recibe 403', async () => {
    const evaluacion = await evaluacionEnRevision()
    await devolver((await otroProfesorDeNorte()).correo, evaluacion, 403)
    expect((await devolucionDe(evaluacion))[0].estado).toBe('EN_REVISION')
  })

  it('un profesor de otra universidad recibe 404', async () => {
    const evaluacion = await evaluacionEnRevision()
    await devolver(PROFESOR_SUR, evaluacion, 404)
    expect((await devolucionDe(evaluacion))[0].estado).toBe('EN_REVISION')
  })

  it('aprobar y devolver a la vez: una responde 200, la otra 409, y queda un solo evento', async () => {
    const evaluacion = await evaluacionEnRevision()
    const token = await tokenDe(PROFESOR)

    // Ambas esperan el lock de la evaluación, que tiene este test.
    const bloqueo = bd.createQueryRunner()
    await bloqueo.startTransaction()
    let respuestas: Promise<number>[]
    try {
      await bloqueo.query(
        `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
        [`notas:${evaluacion}`],
      )
      const base = `${ruta(secciones.s1, evaluacion)}`
      respuestas = [
        request(app.getHttpServer())
          .post(`${base}/aprobacion`)
          .set('Authorization', `Bearer ${token}`),
        request(app.getHttpServer())
          .post(`${base}/devolucion`)
          .set('Authorization', `Bearer ${token}`)
          .send({ comentario: COMENTARIO }),
      ].map((peticion) => peticion.then((r) => r.status))
      await esperarBloqueados(2)
    } finally {
      await bloqueo.commitTransaction()
      await bloqueo.release()
    }
    expect((await Promise.all(respuestas)).sort()).toEqual([200, 409])
    const tipos = (await vueltasDe(evaluacion)).map((v) => v.tipo)
    // ENVIO y la acción que ganó: aprobada (con sus PUBLICACION) o devuelta.
    const [{ estado }] = await devolucionDe(evaluacion)
    expect(
      estado === 'APROBADA' ? tipos.filter((t) => t !== 'PUBLICACION') : tipos,
    ).toEqual(['ENVIO', estado === 'APROBADA' ? 'APROBACION' : 'DEVOLUCION'])
    expect(
      (await filasDe(evaluacion)).every(
        (f) => f.estado === (estado === 'APROBADA' ? 'PUBLICADA' : 'PROPUESTA'),
      ),
    ).toBe(true)
  })

  it('tras devolver, el ayudante edita, reenvía y el profesor aprueba; el historial conserva ambas vueltas', async () => {
    const evaluacion = await evaluacionEnRevision()
    await devolver(PROFESOR, evaluacion, 200)

    // NOT-05 y NOT-07: vuelve a ser editable.
    const guardada = await guardar(
      AYUDANTE,
      evaluacion,
      notasDe([[alumnos.ana, 6.5]]),
      200,
    )
    expect(guardada.estado).toBe('DEVUELTA')
    // NOT-08: el reenvío la deja otra vez en revisión, sin el comentario.
    expect((await enviar(otroAyudante, evaluacion, 200)).estado).toBe(
      'EN_REVISION',
    )
    expect((await devolucionDe(evaluacion))[0].comentario_devolucion).toBeNull()
    await aprobar(PROFESOR, evaluacion, 200)

    expect(
      (await vueltasDe(evaluacion))
        .map((v) => v.tipo)
        .filter((t) => t !== 'PUBLICACION'),
    ).toEqual(['ENVIO', 'DEVOLUCION', 'ENVIO', 'APROBACION'])
    const [{ motivo }] = (await vueltasDe(evaluacion)).filter(
      (v) => v.tipo === 'DEVOLUCION',
    )
    expect(motivo).toBe(COMENTARIO)
    expect(
      (await filasDe(evaluacion)).find((f) => f.alumno_id === alumnos.ana),
    ).toMatchObject({ valor: '6.5', estado: 'PUBLICADA' })
  })

  // Pendiente de NOT-11: un alumno inscrito después del envío.
  it('tras devolver, el ayudante le pone nota a un alumno inscrito después del envío', async () => {
    const evaluacion = await evaluacionEnRevision()
    const nuevo = await crearAlumno(secciones.s1, 'Tomás Tardío')
    await inscribir(secciones.s1, nuevo)
    try {
      // En revisión no se puede.
      await guardar(AYUDANTE, evaluacion, notasDe([[nuevo, 4]]), 409)

      await devolver(PROFESOR, evaluacion, 200)
      await guardar(AYUDANTE, evaluacion, notasDe([[nuevo, 4]]), 200)
      await enviar(AYUDANTE, evaluacion, 200)
      await aprobar(PROFESOR, evaluacion, 200)

      expect(
        (await filasDe(evaluacion)).find((f) => f.alumno_id === nuevo),
      ).toMatchObject({ valor: '4.0', estado: 'PUBLICADA' })
    } finally {
      await bd.query(
        `UPDATE inscripcion SET archived_at = now(), archivada_por = $3
          WHERE seccion_id = $1 AND usuario_id = $2`,
        [secciones.s1, nuevo, await idDe(ADMIN_INGENIERIA)],
      )
    }
  })
})

describe('RLS de la devolución (NOT-12)', () => {
  // Filas modificadas: la RLS omite sin error las que no alcanza.
  const devolverRevision = async (
    q: QueryRunner,
    evaluacion: string,
    {
      comentario = COMENTARIO,
      actualizadoPor = 'usuario_actual()',
    }: { comentario?: string | null; actualizadoPor?: string } = {},
  ): Promise<number> => {
    const [, filas] = await q.query<[unknown[], number]>(
      `UPDATE revision_notas
          SET estado = 'DEVUELTA', comentario_devolucion = $2,
              actualizado_por = ${actualizadoPor}
        WHERE evaluacion_id = $1 RETURNING id`,
      [evaluacion, comentario],
    )
    return Number(filas)
  }
  const comoProfesor = async (
    prueba: (q: QueryRunner) => Promise<void>,
    usuarioId?: string,
  ) =>
    comoApp(
      {
        universidadId: ids.norte,
        rol: 'PROFESOR',
        usuarioId: usuarioId ?? (await idDe(PROFESOR)),
      },
      prueba,
    )

  it('el profesor de la sección devuelve (control positivo)', async () => {
    const evaluacion = await evaluacionEnRevision()
    await comoProfesor(async (q) => {
      expect(await devolverRevision(q, evaluacion)).toBe(1)
    })
  })

  it('sin comentario: 42501', async () => {
    const evaluacion = await evaluacionEnRevision()
    await comoProfesor(async (q) => {
      await expect(
        devolverRevision(q, evaluacion, { comentario: null }),
      ).rejects.toMatchObject({ driverError: { code: SIN_PERMISO } })
    })
  })

  it('un comentario de solo espacios: CHECK', async () => {
    const evaluacion = await evaluacionEnRevision()
    await comoProfesor(async (q) => {
      await expect(
        devolverRevision(q, evaluacion, { comentario: '   ' }),
      ).rejects.toMatchObject({ driverError: { code: CHECK } })
    })
  })

  it('tras reenviar, una nueva devolución exige un comentario nuevo: 42501', async () => {
    const evaluacion = await evaluacionEnRevision()
    await devolver(PROFESOR, evaluacion, 200)
    await enviar(AYUDANTE, evaluacion, 200)
    await comoProfesor(async (q) => {
      // Sin tocar el comentario: el anterior se borró al reenviar.
      await expect(
        q.query(
          `UPDATE revision_notas
              SET estado = 'DEVUELTA', actualizado_por = usuario_actual()
            WHERE evaluacion_id = $1`,
          [evaluacion],
        ),
      ).rejects.toMatchObject({ driverError: { code: SIN_PERMISO } })
    })
  })

  it('a nombre de otro usuario: 42501', async () => {
    const evaluacion = await evaluacionEnRevision()
    const ayudante = await idDe(AYUDANTE)
    await comoProfesor(async (q) => {
      await expect(
        devolverRevision(q, evaluacion, { actualizadoPor: `'${ayudante}'` }),
      ).rejects.toMatchObject({ driverError: { code: SIN_PERMISO } })
    })
  })

  it('el AYUDANTE no devuelve: su UPDATE no alcanza la evaluación en revisión', async () => {
    const evaluacion = await evaluacionEnRevision()
    await comoApp(
      {
        universidadId: ids.norte,
        rol: 'AYUDANTE',
        usuarioId: await idDe(AYUDANTE),
      },
      async (q) => {
        expect(await devolverRevision(q, evaluacion)).toBe(0)
      },
    )
  })

  it('otro profesor de la universidad no alcanza filas', async () => {
    const evaluacion = await evaluacionEnRevision()
    const otro = (await otroProfesorDeNorte()).id
    await comoProfesor(async (q) => {
      expect(await devolverRevision(q, evaluacion)).toBe(0)
    }, otro)
  })

  it('sin usuario en la sesión no alcanza filas', async () => {
    const evaluacion = await evaluacionEnRevision()
    await comoApp({ universidadId: ids.norte, rol: 'PROFESOR' }, async (q) => {
      expect(
        await devolverRevision(q, evaluacion, {
          actualizadoPor: 'actualizado_por',
        }),
      ).toBe(0)
    })
  })

  it('desde otra universidad no alcanza filas de Norte', async () => {
    const evaluacion = await evaluacionEnRevision()
    await comoApp(
      {
        universidadId: ids.sur,
        rol: 'PROFESOR',
        usuarioId: await idDe(PROFESOR_SUR),
      },
      async (q) => {
        expect(await devolverRevision(q, evaluacion)).toBe(0)
      },
    )
  })

  it('el comentario no se escribe al aprobar (trigger)', async () => {
    const evaluacion = await evaluacionEnRevision()
    await comoProfesor(async (q) => {
      await expect(
        q.query(
          `UPDATE revision_notas
              SET estado = 'APROBADA', actualizado_por = usuario_actual(),
                  comentario_devolucion = 'Aprobada con otro comentario'
            WHERE evaluacion_id = $1`,
          [evaluacion],
        ),
      ).rejects.toMatchObject({ driverError: { code: CHECK } })
    })
  })

  it('el ayudante no cambia el comentario al reenviar (trigger)', async () => {
    const evaluacion = await evaluacionEnRevision()
    await devolver(PROFESOR, evaluacion, 200)
    await comoApp({ universidadId: ids.norte, rol: 'AYUDANTE' }, async (q) => {
      await expect(
        q.query(
          `UPDATE revision_notas
                SET estado = 'EN_REVISION', comentario_devolucion = 'Listo'
              WHERE evaluacion_id = $1`,
          [evaluacion],
        ),
      ).rejects.toMatchObject({ driverError: { code: CHECK } })
    })
    expect((await devolucionDe(evaluacion))[0].comentario_devolucion).toBe(
      COMENTARIO,
    )
  })
})

describe('historial de una nota (NOT-16)', () => {
  const destino = (evaluacion: string, alumno: string) =>
    `${ruta(secciones.s1, evaluacion)}/${alumno}/historial`

  async function leerHistorial(
    correo: string,
    evaluacion: string,
    alumno: string,
    status: number,
  ) {
    const token = await tokenDe(correo)
    const peticion = request(app.getHttpServer())
      .get(destino(evaluacion, alumno))
      .set('Authorization', `Bearer ${token}`)
      .expect(status)
    return status === 200
      ? peticion.expect('Cache-Control', 'no-store')
      : peticion
  }

  it('devuelve valores, responsables, fechas y motivos en orden, sin eventos de otros alumnos', async () => {
    const evaluacion = await evaluacionEnRevision()
    await devolver(PROFESOR, evaluacion, 200)
    await guardar(AYUDANTE, evaluacion, notasDe([[alumnos.base, 5.5]]), 200)
    await enviar(AYUDANTE, evaluacion, 200)
    await aprobar(PROFESOR, evaluacion, 200)
    const profesorId = await idDe(PROFESOR)
    const ayudanteId = await idDe(AYUDANTE)
    const primero = '00000000-0000-4000-8000-000000000001'
    const segundo = '00000000-0000-4000-8000-000000000002'
    // NOT-15 escribe estos eventos. Se insertan como fixture para probar la
    // lectura sobre develop. Las dos recorrecciones comparten fecha y se
    // insertan en orden inverso para probar el desempate por id.
    await bd.query(
      `INSERT INTO nota_cambio (id, universidad_id, evaluacion_id, alumno_id, tipo,
                                nota_anterior, nota_nueva, motivo, responsable_id, fecha)
       VALUES ($1, $3, $4, $5, 'RECORRECCION', 6.2, 6.5, 'Segundo ajuste', $6, statement_timestamp()),
              ($2, $3, $4, $5, 'RECORRECCION', 5.5, 6.2, 'Revisión de la rúbrica', $6, statement_timestamp()),
              (gen_random_uuid(), $3, $4, $7, 'RECORRECCION', 5.0, 6.8, 'Motivo de otro alumno', $6, statement_timestamp())`,
      [
        segundo,
        primero,
        ids.norte,
        evaluacion,
        alumnos.base,
        profesorId,
        alumnos.ana,
      ],
    )
    const actores = await bd.query<{ id: string; nombre: string }[]>(
      'SELECT id, nombre FROM usuario WHERE id IN ($1, $2)',
      [profesorId, ayudanteId],
    )
    const antes = await eventosDe(evaluacion)
    const res = await leerHistorial(PROFESOR, evaluacion, alumnos.base, 200)
    const { eventos } = res.body as HistorialNota
    expect(
      eventos.map(({ tipo, notaAnterior, notaNueva, motivo, responsable }) => [
        tipo,
        notaAnterior,
        notaNueva,
        motivo,
        responsable,
      ]),
    ).toEqual([
      ['PROPUESTA', null, 5, null, actores.find((u) => u.id === ayudanteId)],
      ['ENVIO', null, null, null, actores.find((u) => u.id === ayudanteId)],
      [
        'DEVOLUCION',
        null,
        null,
        COMENTARIO,
        actores.find((u) => u.id === profesorId),
      ],
      ['PROPUESTA', 5, 5.5, null, actores.find((u) => u.id === ayudanteId)],
      ['ENVIO', null, null, null, actores.find((u) => u.id === ayudanteId)],
      [
        'PUBLICACION',
        null,
        5.5,
        null,
        actores.find((u) => u.id === profesorId),
      ],
      [
        'APROBACION',
        null,
        null,
        null,
        actores.find((u) => u.id === profesorId),
      ],
      [
        'RECORRECCION',
        5.5,
        6.2,
        'Revisión de la rúbrica',
        actores.find((u) => u.id === profesorId),
      ],
      [
        'RECORRECCION',
        6.2,
        6.5,
        'Segundo ajuste',
        actores.find((u) => u.id === profesorId),
      ],
    ])
    const fechas = eventos.map((evento) => Date.parse(evento.fecha))
    expect(fechas.every(Number.isFinite)).toBe(true)
    expect(fechas).toEqual(fechas.toSorted((a, b) => a - b))
    expect(eventos.slice(-2).map(({ id }) => id)).toEqual([primero, segundo])
    expect(await eventosDe(evaluacion)).toEqual(antes)
  })

  it('permite a otro profesor vigente y rechaza alumnos fuera de la sección y roles ajenos', async () => {
    const evaluacion = await evaluacionEnRevision()
    const [{ id, correo }] = await bd.query<{ id: string; correo: string }[]>(
      `SELECT id, correo FROM usuario
        WHERE universidad_id = $1 AND rol = 'PROFESOR' AND correo <> $2
          AND archived_at IS NULL
        ORDER BY id LIMIT 1`,
      [ids.norte, PROFESOR],
    )
    await request(app.getHttpServer())
      .get(destino(evaluacion, alumnos.base))
      .expect(401)
    await leerHistorial(correo, evaluacion, alumnos.base, 403)
    const [{ id: asignacion }] = await bd.query<{ id: string }[]>(
      'INSERT INTO seccion_profesor (universidad_id, seccion_id, usuario_id) VALUES ($1, $2, $3) RETURNING id',
      [ids.norte, secciones.s1, id],
    )
    try {
      const respuesta = await leerHistorial(
        correo,
        evaluacion,
        alumnos.base,
        200,
      )
      expect(
        (respuesta.body as HistorialNota).eventos.map(({ tipo }) => tipo),
      ).toEqual(['PROPUESTA', 'ENVIO'])
    } finally {
      await bd.query(
        'UPDATE seccion_profesor SET archived_at=now() WHERE id=$1',
        [asignacion],
      )
    }
    await leerHistorial(correo, evaluacion, alumnos.base, 403)
    for (const rol of [AYUDANTE, ALUMNO, ADMIN_INGENIERIA, DIRECTOR]) {
      await leerHistorial(rol, evaluacion, alumnos.base, 403)
    }
    await leerHistorial(PROFESOR_SUR, evaluacion, alumnos.base, 404)
    await leerHistorial(PROFESOR, evaluacion, alumnos.noInscrito, 404)
    await leerHistorial(PROFESOR, evaluacion, alumnos.retirado, 404)
    await leerHistorial(
      PROFESOR,
      await crearEvaluacion(secciones.s2),
      alumnos.base,
      404,
    )
    await leerHistorial(PROFESOR, evaluacion, 'no-es-uuid', 400)
  })

  it('muestra historial vacío cuando el alumno no tiene eventos propios', async () => {
    const evaluacion = await evaluacionEnRevision()
    const nuevo = await crearAlumno(secciones.s1, 'Alumno Tardío Historial')
    await inscribir(secciones.s1, nuevo)
    try {
      const respuesta = await leerHistorial(PROFESOR, evaluacion, nuevo, 200)
      expect(respuesta.body).toEqual({ eventos: [] })
    } finally {
      await bd.query(
        'UPDATE inscripcion SET archived_at=now(), archivada_por=$2 WHERE seccion_id=$3 AND usuario_id=$1',
        [nuevo, await idDe(ADMIN_INGENIERIA), secciones.s1],
      )
    }
  })
})

describe('estado de los envíos del ayudante (NOT-09)', () => {
  async function listarEnvios(
    correo: string,
    estado = 200,
    seccionId = secciones.s1,
  ) {
    const token = await tokenDe(correo)
    const respuesta = await request(app.getHttpServer())
      .get(`/api/espacio/secciones/${seccionId}/evaluaciones`)
      .set('Authorization', `Bearer ${token}`)
      .expect(estado)
    return respuesta.body as EvaluacionesSeccion
  }

  async function comprobar(evaluacion: string, envio: EstadoEnvioNotas) {
    // Cualquier ayudante activo ve el estado de la evaluación, aunque el
    // último envío lo haya hecho otro ayudante de la misma sección.
    for (const correo of [AYUDANTE, otroAyudante]) {
      const lista = await listarEnvios(correo)
      expect(
        lista.evaluaciones.find((e) => e.id === evaluacion)?.envio,
      ).toEqual(envio)
      const detalle = await leer(correo, evaluacion, 200)
      expect(detalle.estado).toBe(envio.estado)
      expect(detalle.comentarioDevolucion).toBe(envio.comentarioDevolucion)
    }
  }

  it('lista y detalle recorren borrador, revisión, devolución editable, reenvío y aprobación', async () => {
    const evaluacion = await crearEvaluacion()
    const borrador: EstadoEnvioNotas = {
      estado: 'BORRADOR',
      comentarioDevolucion: null,
    }
    await comprobar(evaluacion, borrador)
    // Leer un borrador no crea una revisión ni eventos de escritura.
    expect(await devolucionDe(evaluacion)).toEqual([])
    expect(await eventosDe(evaluacion)).toEqual([])
    const inscritos = await bd.query<{ id: string }[]>(
      'SELECT usuario_id AS id FROM inscripcion WHERE seccion_id = $1 AND archived_at IS NULL',
      [secciones.s1],
    )
    await guardar(
      AYUDANTE,
      evaluacion,
      notasDe(inscritos.map((a) => [a.id, 5])),
      200,
    )
    await comprobar(evaluacion, borrador)
    await enviar(AYUDANTE, evaluacion, 200)
    const enRevision: EstadoEnvioNotas = {
      estado: 'EN_REVISION',
      comentarioDevolucion: null,
    }
    await comprobar(evaluacion, enRevision)
    await guardar(AYUDANTE, evaluacion, notasDe([[alumnos.ana, 6]]), 409)

    const comentario = 'Revisa la pregunta 3.\nJustifica el resultado de Ana.'
    const devuelta = await devolver(PROFESOR, evaluacion, 200, { comentario })
    expect(devuelta.comentarioDevolucion).toBe(comentario)
    const envioDevuelto: EstadoEnvioNotas = {
      estado: 'DEVUELTA',
      comentarioDevolucion: comentario,
    }
    await comprobar(evaluacion, envioDevuelto)
    const corregida = await guardar(
      otroAyudante,
      evaluacion,
      notasDe([[alumnos.ana, 6.5]]),
      200,
    )
    expect(corregida.comentarioDevolucion).toBe(comentario)
    await comprobar(evaluacion, envioDevuelto)
    expect(
      (await filasDe(evaluacion)).find((n) => n.alumno_id === alumnos.ana)
        ?.valor,
    ).toBe('6.5')

    const reenviada = await enviar(otroAyudante, evaluacion, 200)
    expect(reenviada.comentarioDevolucion).toBeNull()
    await comprobar(evaluacion, enRevision)
    const aprobada = await aprobar(PROFESOR, evaluacion, 200)
    expect(aprobada.comentarioDevolucion).toBeNull()
    await comprobar(evaluacion, {
      estado: 'APROBADA',
      comentarioDevolucion: null,
    })
    await guardar(AYUDANTE, evaluacion, notasDe([[alumnos.ana, 6.7]]), 409)
  })

  it.each([ALUMNO, PROFESOR, DIRECTOR, DIRECTOR_SUR])(
    '%s no recibe estados ni comentarios por el listado de evaluaciones',
    async (correo) => {
      const evaluacion = await evaluacionEnRevision()
      await devolver(PROFESOR, evaluacion, 200)
      const lista = await listarEnvios(correo)
      const fila = lista.evaluaciones.find((e) => e.id === evaluacion)
      expect(fila).toBeDefined()
      expect(fila).not.toHaveProperty('envio')
      expect(fila).not.toHaveProperty('comentarioDevolucion')
    },
  )

  it('excluye evaluaciones archivadas y no trae envíos de otra sección', async () => {
    const archivada = await crearEvaluacion(secciones.s1, { archivada: true })
    const otraSeccion = await crearEvaluacion(secciones.s2)
    const lista = await listarEnvios(AYUDANTE)
    expect(lista.evaluaciones.map((e) => e.id)).not.toContain(archivada)
    expect(lista.evaluaciones.map((e) => e.id)).not.toContain(otraSeccion)
  })

  it.each<[string, () => string, number]>([
    ['otra sección', () => ayudanteOtraSeccion, 403],
    ['otra universidad', () => AYUDANTE_SUR, 404],
  ])(
    'un ayudante de %s no lee los comentarios',
    async (_caso, correo, estado) => {
      await listarEnvios(correo(), estado)
    },
  )
})
