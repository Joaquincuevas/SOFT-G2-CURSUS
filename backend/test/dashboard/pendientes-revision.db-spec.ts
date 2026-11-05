import type {
  EstadoRevisionNotas,
  NotasEvaluacion,
  PendienteRevision,
  SeccionDashboard,
} from '@cursus/shared'
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

// NOT-10: base propia con el seed cargado, que se crea y se borra en cada
// ejecución. Todos los usuarios del seed comparten la contraseña.
const BD_TEST = `${process.env.POSTGRES_TEST_DB ?? 'cursus_test'}_pendientes_revision`
const PASSWORD = 'contraseña-de-prueba'
// Hash con formato válido; los alumnos creados aquí no inician sesión.
const HASH = '$2b$10$abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOP'
const BD_ORIGINAL = process.env.POSTGRES_DB

const PROFESOR = 'profesor@norte.cursus.test'
const AYUDANTE = 'ayudante@norte.cursus.test'
const ALUMNO = 'alumno@norte.cursus.test'
const DIRECTOR = 'director@norte.cursus.test'
const ADMIN_INGENIERIA = 'administrativo.ingenieria@norte.cursus.test'
const PROFESOR_SUR = 'profesor@sur.cursus.test'

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
async function pedir(
  metodo: 'get' | 'put' | 'post',
  correo: string,
  ruta: string,
  estado: number,
  cuerpo?: object,
) {
  const token = await tokenDe(correo)
  const peticion = request(app.getHttpServer())
    [metodo](ruta)
    .set('Authorization', `Bearer ${token}`)
  const respuesta = await (cuerpo ? peticion.send(cuerpo) : peticion).expect(
    estado,
  )
  return respuesta.body as unknown
}

const pendientes = async (correo: string) =>
  (await pedir(
    'get',
    correo,
    '/api/dashboard/pendientes-revision',
    200,
  )) as PendienteRevision[]

const misSecciones = async (correo: string) =>
  (await pedir(
    'get',
    correo,
    '/api/dashboard/mis-secciones',
    200,
  )) as SeccionDashboard[]

const rutaNotas = (seccionId: string, evaluacionId: string) =>
  `/api/espacio/secciones/${seccionId}/evaluaciones/${evaluacionId}/notas`

const usuarioDe = async (correo: string) =>
  (
    await bd.query<{ id: string; nombre: string }[]>(
      'SELECT id, nombre FROM usuario WHERE correo = $1',
      [correo],
    )
  )[0]

const idDe = async (correo: string) => (await usuarioDe(correo)).id

const seccionDe = async (codigo: string, numero: number, dominio: string) =>
  (
    await bd.query<{ id: string }[]>(
      `SELECT s.id FROM seccion s JOIN curso c ON c.id = s.curso_id
        JOIN universidad u ON u.id = s.universidad_id
        JOIN periodo p ON p.id = c.periodo_id
       WHERE c.codigo = $1 AND s.numero = $2 AND u.dominio_correo = $3
         AND p.activo`,
      [codigo, numero, dominio],
    )
  )[0].id

const asignarProfesor = (seccionId: string, profesorId: string) =>
  bd.query('UPDATE seccion SET profesor_id = $2 WHERE id = $1', [
    seccionId,
    profesorId,
  ])

const asignarAyudante = async (seccionId: string, correo: string) =>
  bd.query<unknown>(
    `INSERT INTO ayudante_seccion (universidad_id, seccion_id, usuario_id)
     SELECT universidad_id, $1, $2 FROM seccion WHERE id = $1`,
    [seccionId, await idDe(correo)],
  )

// Crea un alumno y lo inscribe en la sección.
async function inscribirNuevo(seccionId: string, nombre: string) {
  const [{ id }] = await bd.query<{ id: string }[]>(
    `WITH alumno AS (
       INSERT INTO usuario (universidad_id, nombre, correo, password_hash, rol)
       SELECT universidad_id, $2, $3, $4, 'ALUMNO' FROM seccion WHERE id = $1
       RETURNING id, universidad_id
     )
     INSERT INTO inscripcion (universidad_id, seccion_id, usuario_id)
     SELECT universidad_id, $1, id FROM alumno
     RETURNING usuario_id AS id`,
    [
      seccionId,
      nombre,
      `${nombre.replace(/\W/g, '').toLowerCase()}.${seccionId.slice(0, 8)}@pendientes.test`,
      HASH,
    ],
  )
  return id
}

async function crearEvaluacion(
  seccionId: string,
  nombre: string,
  { archivada = false } = {},
) {
  const [{ id }] = await bd.query<{ id: string }[]>(
    `INSERT INTO evaluacion (universidad_id, seccion_id, nombre, fecha, ponderacion, creada_por, archived_at)
     SELECT s.universidad_id, s.id, $2, p.fecha_inicio, 10, s.profesor_id,
            ${archivada ? 'now()' : 'NULL'}
       FROM seccion s JOIN curso c ON c.id = s.curso_id
       JOIN periodo p ON p.id = c.periodo_id
      WHERE s.id = $1
     RETURNING id`,
    [seccionId, nombre],
  )
  return id
}

// Deja la evaluación en el estado dado, como dueño de las tablas (sin pasar
// por la API), con un evento ENVIO por cada envío: [correo, fecha].
async function marcar(
  evaluacionId: string,
  estado: EstadoRevisionNotas,
  envios: [correo: string, fecha: string][] = [],
) {
  const [primero] = envios
  await bd.query(
    `INSERT INTO revision_notas (universidad_id, evaluacion_id, estado, actualizado_por)
     SELECT universidad_id, id, $2, $3 FROM evaluacion WHERE id = $1`,
    [evaluacionId, estado, await idDe(primero?.[0] ?? AYUDANTE)],
  )
  for (const [correo, fecha] of envios) {
    await bd.query(
      `INSERT INTO nota_cambio (universidad_id, evaluacion_id, tipo, responsable_id, fecha)
       SELECT universidad_id, id, 'ENVIO', $2, $3 FROM evaluacion WHERE id = $1`,
      [evaluacionId, await idDe(correo), fecha],
    )
  }
}

async function ponerNota(evaluacionId: string, alumnoId: string) {
  await bd.query(
    `INSERT INTO nota (universidad_id, evaluacion_id, alumno_id, valor, propuesta_por)
     SELECT universidad_id, id, $2, 5.5, $3 FROM evaluacion WHERE id = $1`,
    [evaluacionId, alumnoId, await idDe(AYUDANTE)],
  )
}

const ids = {
  s1: '',
  s2: '',
  otraSeccion: '',
  sur: '',
  enRevision1: '',
  enRevision2: '',
  sur1: '',
}
const alumnos: string[] = []
let otroAyudante = ''

// Escenario, armado como dueño de las tablas (sin RLS). El profesor base
// queda a cargo de ICC101-1 y ICC201-2; ICC101-2 es de otro profesor.
async function armarEscenario() {
  const profesor = await idDe(PROFESOR)
  ids.s1 = await seccionDe('ICC101', 1, 'norte.cursus.test')
  ids.s2 = await seccionDe('ICC201', 2, 'norte.cursus.test')
  ids.otraSeccion = await seccionDe('ICC101', 2, 'norte.cursus.test')
  await asignarProfesor(ids.s1, profesor)
  await asignarProfesor(ids.s2, profesor)
  const [{ id: otroProfesor }] = await bd.query<{ id: string }[]>(
    `SELECT u.id FROM usuario u JOIN universidad un ON un.id = u.universidad_id
      WHERE u.rol = 'PROFESOR' AND un.dominio_correo = 'norte.cursus.test'
        AND u.correo <> $1 ORDER BY u.correo LIMIT 1`,
    [PROFESOR],
  )
  await asignarProfesor(ids.otraSeccion, otroProfesor)

  // Un segundo ayudante de demo del seed, para el reenvío.
  const [demo] = await bd.query<{ correo: string }[]>(
    `SELECT u.correo FROM usuario u JOIN universidad un ON un.id = u.universidad_id
      WHERE u.rol = 'AYUDANTE' AND un.dominio_correo = 'norte.cursus.test'
        AND u.correo <> $1 ORDER BY u.correo LIMIT 1`,
    [AYUDANTE],
  )
  otroAyudante = demo.correo
  for (const id of [ids.s1, ids.s2, ids.otraSeccion]) {
    await asignarAyudante(id, AYUDANTE)
  }
  await asignarAyudante(ids.s1, otroAyudante)

  // s1: dos alumnos activos.
  alumnos.push(await inscribirNuevo(ids.s1, 'Ana Pendiente'))
  alumnos.push(await inscribirNuevo(ids.s1, 'Bruno Pendiente'))

  // Pendientes: en s1 con todas las notas, enviada dos veces (vale la
  // última); en s2, enviada antes y sin alumnos.
  ids.enRevision1 = await crearEvaluacion(ids.s1, 'Control 1')
  for (const alumno of alumnos) await ponerNota(ids.enRevision1, alumno)
  await marcar(ids.enRevision1, 'EN_REVISION', [
    [AYUDANTE, '2026-09-10T12:00:00Z'],
    [otroAyudante, '2026-09-12T15:30:00Z'],
  ])
  ids.enRevision2 = await crearEvaluacion(ids.s2, 'Tarea 1')
  await marcar(ids.enRevision2, 'EN_REVISION', [
    [AYUDANTE, '2026-09-11T09:00:00Z'],
  ])

  // No pendientes: sin fila (borrador), BORRADOR, DEVUELTA, APROBADA,
  // evaluación archivada y de otra sección (otro profesor).
  await crearEvaluacion(ids.s1, 'Sin fila')
  await marcar(await crearEvaluacion(ids.s1, 'Borrador'), 'BORRADOR')
  await marcar(await crearEvaluacion(ids.s1, 'Devuelta'), 'DEVUELTA', [
    [AYUDANTE, '2026-09-01T12:00:00Z'],
  ])
  await marcar(await crearEvaluacion(ids.s1, 'Aprobada'), 'APROBADA', [
    [AYUDANTE, '2026-09-01T12:00:00Z'],
  ])
  await marcar(
    await crearEvaluacion(ids.s1, 'Archivada', { archivada: true }),
    'EN_REVISION',
    [[AYUDANTE, '2026-09-01T12:00:00Z']],
  )
  await marcar(
    await crearEvaluacion(ids.otraSeccion, 'De otro profesor'),
    'EN_REVISION',
    [[AYUDANTE, '2026-09-01T12:00:00Z']],
  )

  // Sección archivada y sección de un curso archivado, a su cargo, cada una
  // con una evaluación en revisión.
  const [{ id: archivada }] = await bd.query<{ id: string }[]>(
    `INSERT INTO seccion (universidad_id, curso_id, numero, archived_at, profesor_id)
     SELECT universidad_id, curso_id, 9, now(), $2 FROM seccion WHERE id = $1
     RETURNING id`,
    [ids.s1, profesor],
  )
  await marcar(
    await crearEvaluacion(archivada, 'De sección archivada'),
    'EN_REVISION',
    [[AYUDANTE, '2026-09-01T12:00:00Z']],
  )
  const ico201 = await seccionDe('ICO201', 1, 'norte.cursus.test')
  await asignarProfesor(ico201, profesor)
  await marcar(
    await crearEvaluacion(ico201, 'De curso archivado'),
    'EN_REVISION',
    [[AYUDANTE, '2026-09-01T12:00:00Z']],
  )
  await bd.query(
    `UPDATE curso SET archived_at = now()
      WHERE id = (SELECT curso_id FROM seccion WHERE id = $1)`,
    [ico201],
  )

  // Sur: una pendiente de su profesor.
  const [{ id: sur }] = await bd.query<{ id: string }[]>(
    `SELECT s.id FROM seccion s JOIN universidad u ON u.id = s.universidad_id
       JOIN curso c ON c.id = s.curso_id JOIN periodo p ON p.id = c.periodo_id
      WHERE u.dominio_correo = 'sur.cursus.test' AND p.activo
        AND s.archived_at IS NULL AND c.archived_at IS NULL
      ORDER BY c.codigo, s.numero LIMIT 1`,
  )
  ids.sur = sur
  await asignarProfesor(sur, await idDe(PROFESOR_SUR))
  ids.sur1 = await crearEvaluacion(sur, 'Control Sur')
  await bd.query(
    `INSERT INTO revision_notas (universidad_id, evaluacion_id, estado, actualizado_por)
     SELECT universidad_id, id, 'EN_REVISION', $2 FROM evaluacion WHERE id = $1`,
    [ids.sur1, await idDe(PROFESOR_SUR)],
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

describe('GET /api/dashboard/pendientes-revision (NOT-10)', () => {
  it('solo las evaluaciones EN_REVISION vigentes de sus secciones, de la más antigua a la más nueva', async () => {
    const lista = await pendientes(PROFESOR)

    // Sin borradores, devueltas, aprobadas, archivadas, de otro profesor, de
    // una sección o un curso archivados, ni de otra universidad.
    expect(lista.map((p) => p.evaluacion.nombre)).toEqual([
      'Tarea 1',
      'Control 1',
    ])
  })

  it('cada pendiente trae curso, sección, evaluación, el último envío y los alumnos sin nota', async () => {
    const lista = await pendientes(PROFESOR)
    const control1 = lista.find((p) => p.evaluacion.id === ids.enRevision1)
    const tarea1 = lista.find((p) => p.evaluacion.id === ids.enRevision2)

    // Enviada dos veces: vale el último ENVIO (otro ayudante, el 12).
    expect(control1).toEqual({
      evaluacion: {
        id: ids.enRevision1,
        nombre: 'Control 1',
        fecha: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) as string,
      },
      seccion: { id: ids.s1, numero: 1 },
      curso: {
        id: expect.any(String) as string,
        codigo: 'ICC101',
        nombre: 'Introducción a la Programación',
      },
      ayudante: await usuarioDe(otroAyudante),
      enviadaEl: '2026-09-12T15:30:00.000Z',
      sinNota: 0,
    } satisfies PendienteRevision)
    expect(tarea1).toMatchObject({
      seccion: { id: ids.s2, numero: 2 },
      curso: { codigo: 'ICC201' },
      ayudante: await usuarioDe(AYUDANTE),
      enviadaEl: '2026-09-11T09:00:00.000Z',
      sinNota: 0,
    })
  })

  it('un alumno inscrito después del envío cuenta como sin nota (NOT-08)', async () => {
    const nuevo = await inscribirNuevo(ids.s1, 'Carla Tardía')
    try {
      const control1 = (await pendientes(PROFESOR)).find(
        (p) => p.evaluacion.id === ids.enRevision1,
      )
      expect(control1?.sinNota).toBe(1)
    } finally {
      await bd.query(
        `UPDATE inscripcion SET archived_at = now(), archivada_por = $2
          WHERE usuario_id = $1`,
        [nuevo, await idDe(ADMIN_INGENIERIA)],
      )
    }
  })

  it('el contador del dashboard coincide con la lista, por sección', async () => {
    const lista = await pendientes(PROFESOR)
    const secciones = await misSecciones(PROFESOR)
    const porSeccion = (id: string) =>
      lista.filter((p) => p.seccion.id === id).length

    expect(secciones.length).toBeGreaterThan(0)
    for (const seccion of secciones) {
      expect(seccion.pendientesRevision).toBe(porSeccion(seccion.id))
    }
    expect(
      secciones.reduce((total, s) => total + s.pendientesRevision, 0),
    ).toBe(lista.length)
  })

  it('cada universidad ve solo las suyas', async () => {
    expect(
      (await pendientes(PROFESOR_SUR)).map((p) => p.evaluacion.id),
    ).toEqual([ids.sur1])
    expect(
      (await pendientes(PROFESOR)).map((p) => p.evaluacion.id),
    ).not.toContain(ids.sur1)
  })

  it('una evaluación en revisión de un período que ya cerró deja de aparecer en la lista y el contador', async () => {
    const marcarActivo = (activo: boolean) =>
      bd.query(
        `UPDATE periodo SET activo = $1
          WHERE id = (SELECT c.periodo_id FROM seccion s
                        JOIN curso c ON c.id = s.curso_id WHERE s.id = $2)`,
        [activo, ids.s1],
      )
    await tokenDe(PROFESOR)
    await marcarActivo(false)
    try {
      // Sigue en revisión, pero fuera del período activo.
      const [{ estado }] = await bd.query<{ estado: string }[]>(
        'SELECT estado FROM revision_notas WHERE evaluacion_id = $1',
        [ids.enRevision1],
      )
      expect(estado).toBe('EN_REVISION')
      expect(await pendientes(PROFESOR)).toEqual([])
      expect(await misSecciones(PROFESOR)).toEqual([])
    } finally {
      await marcarActivo(true)
    }
  })

  it.each([AYUDANTE, ALUMNO, ADMIN_INGENIERIA, DIRECTOR])(
    '%s recibe 403',
    async (correo) => {
      await pedir('get', correo, '/api/dashboard/pendientes-revision', 403)
    },
  )
})

describe('abrir una pendiente (NOT-10)', () => {
  it('el profesor ve todas las notas propuestas, en revisión', async () => {
    const notas = (await pedir(
      'get',
      PROFESOR,
      rutaNotas(ids.s1, ids.enRevision1),
      200,
    )) as NotasEvaluacion

    expect(notas.estado).toBe('EN_REVISION')
    expect(notas.alumnos.map((a) => [a.id, a.nota, a.estado])).toEqual(
      alumnos.map((id) => [id, 5.5, 'PROPUESTA']),
    )
  })

  it('el profesor de otra universidad recibe 404', async () => {
    await pedir('get', PROFESOR_SUR, rutaNotas(ids.s1, ids.enRevision1), 404)
  })
})

describe('reenvío por la API (NOT-08 y NOT-12)', () => {
  it('tras devolver y reenviar, la pendiente muestra al ayudante y la fecha del último envío', async () => {
    const evaluacion = await crearEvaluacion(ids.s1, 'Control reenviado')
    await pedir('put', AYUDANTE, rutaNotas(ids.s1, evaluacion), 200, {
      notas: alumnos.map((alumnoId) => ({ alumnoId, nota: 6 })),
    })
    const envio = `${rutaNotas(ids.s1, evaluacion)}/envio`
    await pedir('post', AYUDANTE, envio, 200)
    // NOT-12 aún no existe: la devolución se hace como dueño de la tabla.
    await bd.query(
      `UPDATE revision_notas SET estado = 'DEVUELTA' WHERE evaluacion_id = $1`,
      [evaluacion],
    )
    expect(
      (await pendientes(PROFESOR)).map((p) => p.evaluacion.id),
    ).not.toContain(evaluacion)
    await pedir('post', otroAyudante, envio, 200)

    const eventos = await bd.query<{ responsable_id: string; fecha: Date }[]>(
      `SELECT responsable_id, fecha FROM nota_cambio
        WHERE evaluacion_id = $1 AND tipo = 'ENVIO' ORDER BY fecha, id`,
      [evaluacion],
    )
    expect(eventos).toHaveLength(2)
    const pendiente = (await pendientes(PROFESOR)).find(
      (p) => p.evaluacion.id === evaluacion,
    )
    expect(pendiente?.ayudante).toEqual(await usuarioDe(otroAyudante))
    expect(pendiente?.enviadaEl).toBe(eventos[1].fecha.toISOString())
  })
})
