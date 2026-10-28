import type { ErrorListaNotas, NotasEvaluacion, Rol } from '@cursus/shared'
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
    ErrorListaNotas & { message: string | string[] }
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
    ['un alumno inscrito (ve las suyas publicadas en NOT-13)', ALUMNO, 403],
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

  it.each([
    ['cero', 0],
    ['sobre 7,0', 8],
    ['con dos decimales', 5.55],
    ['que no es un número', 'x'],
  ])(
    'una nota %s responde 400 "Nota inválida" sin escribir filas ni eventos',
    async (_caso, nota) => {
      const evaluacion = await crearEvaluacion()
      const respuesta = await guardar(
        AYUDANTE,
        evaluacion,
        notasDe([[alumnos.ana, nota]]),
        400,
      )

      expect(respuesta.message).toBe('Nota inválida')
      expect(await filasDe(evaluacion)).toEqual([])
      expect(await eventosDe(evaluacion)).toEqual([])
    },
  )

  it('una lista con una nota válida y una inválida no guarda nada', async () => {
    const evaluacion = await crearEvaluacion()
    const respuesta = await guardar(
      AYUDANTE,
      evaluacion,
      notasDe([
        [alumnos.ana, 6],
        [alumnos.zoe, 8],
      ]),
      400,
    )

    expect(respuesta.message).toBe('Nota inválida')
    expect(await filasDe(evaluacion)).toEqual([])
    expect(await eventosDe(evaluacion)).toEqual([])
  })

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
    ['una nota sin valor', { notas: [{ alumnoId: NO_EXISTE }] }],
    ['una nota nula', { notas: [{ alumnoId: NO_EXISTE, nota: null }] }],
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

  it('una nota publicada en la lista rechaza todas, también las nuevas que van antes', async () => {
    const evaluacion = await crearEvaluacion()
    await insertarDirecto(evaluacion, {
      alumno_id: alumnos.ana,
      valor: 6,
      estado: 'PUBLICADA',
    })

    await guardar(
      AYUDANTE,
      evaluacion,
      notasDe([
        [alumnos.bruno, 5],
        [alumnos.ana, 3],
      ]),
      400,
    )

    // Ni la nota nueva de Bruno ni un evento.
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

  it('el ALUMNO no ve ninguna fila, ni siquiera su nota publicada', async () => {
    const [{ total }] = await bd.query<{ total: string }[]>(
      `SELECT count(*) AS total FROM nota
        WHERE alumno_id = $1 AND estado = 'PUBLICADA'`,
      [alumnos.base],
    )
    expect(Number(total)).toBeGreaterThan(0)

    await comoApp({ universidadId: ids.norte, rol: 'ALUMNO' }, async (q) => {
      expect(await q.query('SELECT * FROM nota')).toEqual([])
    })
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
