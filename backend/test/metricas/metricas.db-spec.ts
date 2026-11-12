import type {
  MetricasConsolidadas,
  MetricasUniversidad,
  ResumenUniversidad,
  NotasFinalesSeccion,
  ResumenAsistenciaSeccion,
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
import { calcularNotaFinal } from '../../src/notas/nota-final.js'

// MET-01: base propia con el seed cargado, que se crea y se borra en cada
// ejecución. El seed no trae evaluaciones, notas ni clases: todo lo que
// cuenta lo arma este test en dos secciones nuevas, una por universidad, así
// los denominadores son solo los suyos.
const BD_TEST = `${process.env.POSTGRES_TEST_DB ?? 'cursus_test'}_metricas`
const PASSWORD = 'contraseña-de-prueba'
const HASH = '$2b$10$abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOP'
const BD_ORIGINAL = process.env.POSTGRES_DB

const DIRECTOR = 'director@norte.cursus.test'
const PROFESOR = 'profesor@norte.cursus.test'
const PROFESOR_SUR = 'profesor@sur.cursus.test'
const AYUDANTE = 'ayudante@norte.cursus.test'
const ALUMNO = 'alumno@norte.cursus.test'
const ADMIN_INGENIERIA = 'administrativo.ingenieria@norte.cursus.test'
const RUTA = '/api/metricas/consolidado'

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

// El token se pide antes de crear la petición (ver pendientes-revision).
async function obtener<T>(correo: string, ruta: string, estado = 200) {
  const token = await tokenDe(correo)
  const respuesta = await request(app.getHttpServer())
    .get(ruta)
    .set('Authorization', `Bearer ${token}`)
    .expect(estado)
  return respuesta.body as T
}

const consolidado = () => obtener<MetricasConsolidadas>(DIRECTOR, RUTA)

const idDe = async (correo: string) =>
  (
    await bd.query<{ id: string }[]>(
      'SELECT id FROM usuario WHERE correo = $1',
      [correo],
    )
  )[0].id

// Sección nueva (número 9) del primer curso vigente del período activo de la
// universidad, a cargo del profesor. GES-25 sincroniza seccion_profesor.
async function crearSeccion(dominio: string, profesor: string) {
  const [{ id }] = await bd.query<{ id: string }[]>(
    `INSERT INTO seccion (universidad_id, curso_id, numero, profesor_id)
     SELECT c.universidad_id, c.id, 9, $2
       FROM curso c JOIN universidad u ON u.id = c.universidad_id
       JOIN periodo p ON p.id = c.periodo_id
      WHERE u.dominio_correo = $1 AND p.activo AND c.archived_at IS NULL
      ORDER BY c.codigo LIMIT 1
     RETURNING id`,
    [dominio, await idDe(profesor)],
  )
  return id
}

async function inscribir(seccionId: string, nombre: string, archivada = false) {
  const [{ id }] = await bd.query<{ id: string }[]>(
    `WITH alumno AS (
       INSERT INTO usuario (universidad_id, nombre, correo, password_hash, rol)
       SELECT universidad_id, $2, $3, $4, 'ALUMNO' FROM seccion WHERE id = $1
       RETURNING id, universidad_id
     )
     INSERT INTO inscripcion (universidad_id, seccion_id, usuario_id, archived_at, archivada_por)
     SELECT a.universidad_id, $1, a.id,
            ${archivada ? 'now(), s.profesor_id' : 'NULL, NULL'}
       FROM alumno a JOIN seccion s ON s.id = $1
     RETURNING usuario_id AS id`,
    [
      seccionId,
      nombre,
      `${nombre.replace(/\W/g, '').toLowerCase()}.${seccionId.slice(0, 8)}@metricas.test`,
      HASH,
    ],
  )
  return id
}

async function crearEvaluacion(
  seccionId: string,
  nombre: string,
  ponderacion: number,
  archivada = false,
) {
  const [{ id }] = await bd.query<{ id: string }[]>(
    `INSERT INTO evaluacion (universidad_id, seccion_id, nombre, fecha, ponderacion, creada_por, archived_at)
     SELECT s.universidad_id, s.id, $2, p.fecha_inicio, $3, s.profesor_id,
            ${archivada ? 'now()' : 'NULL'}
       FROM seccion s JOIN curso c ON c.id = s.curso_id
       JOIN periodo p ON p.id = c.periodo_id
      WHERE s.id = $1
     RETURNING id`,
    [seccionId, nombre, ponderacion],
  )
  return id
}

// Nota como dueño de las tablas: PUBLICADA salvo que se indique otro estado.
const ponerNota = (
  evaluacionId: string,
  alumnoId: string,
  valor: number,
  estado = 'PUBLICADA',
  archivada = false,
) =>
  bd.query(
    `INSERT INTO nota (universidad_id, evaluacion_id, alumno_id, valor, propuesta_por, estado, archived_at)
     SELECT e.universidad_id, e.id, $2, $3, s.profesor_id, $4, ${archivada ? 'now()' : 'NULL'}
       FROM evaluacion e JOIN seccion s ON s.id = e.seccion_id
      WHERE e.id = $1`,
    [evaluacionId, alumnoId, valor, estado],
  )

async function crearClase(
  seccionId: string,
  semana: number,
  archivada = false,
) {
  const [{ id }] = await bd.query<{ id: string }[]>(
    `INSERT INTO clase (universidad_id, seccion_id, fecha, inicio, termino, sala, creada_por, archived_at)
     SELECT s.universidad_id, s.id, p.fecha_inicio + $2 * 7, '08:30', '10:00',
            'Sala A-101', s.profesor_id, ${archivada ? 'now()' : 'NULL'}
       FROM seccion s JOIN curso c ON c.id = s.curso_id
       JOIN periodo p ON p.id = c.periodo_id
      WHERE s.id = $1
     RETURNING id`,
    [seccionId, semana],
  )
  return id
}

const marcar = (claseId: string, alumnoId: string, presente: boolean) =>
  bd.query(
    `INSERT INTO asistencia (universidad_id, clase_id, alumno_id, presente, registrada_por)
     SELECT c.universidad_id, c.id, $2, $3, s.profesor_id
       FROM clase c JOIN seccion s ON s.id = c.seccion_id WHERE c.id = $1`,
    [claseId, alumnoId, presente],
  )

const ids = { norte: '', sur: '' }

// Norte, sección nueva con E1 (60 %) y E2 (40 %) y dos clases con marcas:
// - Ana: 5,0 y 6,0 → 5,4 FINAL, aprueba. Presente en las dos clases.
// - Bruno: 3,0 y 4,5 → 3,6 FINAL, reprueba. Presente en la 1; sin marca en
//   la 2 (ausente).
// - Carla: 5,0 en E1 y solo una PROPUESTA en E2 → PARCIAL, no cuenta en
//   notas. Ausente en la 1, presente en la 2.
// - Diego: inscripción archivada con 7,0 y 7,0 y presente en todo: no cuenta.
// Además una evaluación archivada con 1,0 de Ana, una nota archivada de
// Bruno, una clase sin marcas y una clase archivada con marcas: no cuentan.
// Sur, sección nueva con E (100 %): Elena 4,0 → FINAL, aprueba; una clase
// con Elena ausente.
// Consolidado: aprobación 2 de 3 (66,7 %), promedio (5,4 + 3,6 + 4,0) / 3 =
// 4,33, asistencia 4 presentes de 7 registros (57,14 %). Si fuera promedio
// de promedios por universidad: 75 %, 4,25 y 36,1 %.
async function armarEscenario() {
  ids.norte = await crearSeccion('norte.cursus.test', PROFESOR)
  const ana = await inscribir(ids.norte, 'Ana Metricas')
  const bruno = await inscribir(ids.norte, 'Bruno Metricas')
  const carla = await inscribir(ids.norte, 'Carla Metricas')
  const diego = await inscribir(ids.norte, 'Diego Metricas', true)
  const e1 = await crearEvaluacion(ids.norte, 'E1', 60)
  const e2 = await crearEvaluacion(ids.norte, 'E2', 40)
  const archivada = await crearEvaluacion(ids.norte, 'Archivada', 100, true)
  await ponerNota(e1, ana, 5.0)
  await ponerNota(e2, ana, 6.0)
  await ponerNota(archivada, ana, 1.0)
  await ponerNota(e1, bruno, 3.0)
  await ponerNota(e2, bruno, 4.5)
  await ponerNota(e2, bruno, 1.0, 'PUBLICADA', true)
  await ponerNota(e1, carla, 5.0)
  await ponerNota(e2, carla, 7.0, 'PROPUESTA')
  await ponerNota(e1, diego, 7.0)
  await ponerNota(e2, diego, 7.0)
  const c1 = await crearClase(ids.norte, 1)
  const c2 = await crearClase(ids.norte, 2)
  await crearClase(ids.norte, 3)
  const cArchivada = await crearClase(ids.norte, 4, true)
  await marcar(c1, ana, true)
  await marcar(c1, bruno, true)
  await marcar(c1, carla, false)
  await marcar(c1, diego, true)
  await marcar(c2, ana, true)
  await marcar(c2, carla, true)
  await marcar(c2, diego, true)
  await marcar(cArchivada, ana, false)
  await marcar(cArchivada, bruno, false)

  ids.sur = await crearSeccion('sur.cursus.test', PROFESOR_SUR)
  const elena = await inscribir(ids.sur, 'Elena Metricas')
  await ponerNota(await crearEvaluacion(ids.sur, 'E', 100), elena, 4.0)
  await marcar(await crearClase(ids.sur, 1), elena, false)
}

beforeAll(async () => {
  admin = await new DataSource(opcionesDataSource()).initialize()
  await admin.query(`DROP DATABASE IF EXISTS "${BD_TEST}" WITH (FORCE)`)
  await admin.query(`CREATE DATABASE "${BD_TEST}"`)
  bd = await new DataSource(opcionesDataSource(BD_TEST)).initialize()
  await bd.runMigrations()
  await ejecutarSeed(bd, PASSWORD)
  await armarEscenario()
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

describe('GET /api/metricas/consolidado (MET-01)', () => {
  it('consolida las dos universidades ponderado por alumno, con notas publicadas y asistencia registrada', async () => {
    const m = await consolidado()
    expect(m.periodos).toEqual([
      { universidad: 'Universidad Demo Norte', anio: 2026, semestre: 2 },
      { universidad: 'Universidad Demo Sur', anio: 2026, semestre: 2 },
    ])
    expect(m.aprobacion).toEqual({ valor: 66.7, aprobados: 2, evaluados: 3 })
    expect(m.promedio).toEqual({ valor: 4.33, alumnos: 3 })
    expect(m.asistencia).toEqual({ valor: 57.14, presentes: 4, registros: 7 })
    // Todos los inscritos vigentes del período activo (los del seed también),
    // sin Diego.
    const [{ alumnos, cursos }] = await bd.query<
      { alumnos: string; cursos: string }[]
    >(
      `WITH del_periodo AS (
         SELECT s.id, s.universidad_id, c.id AS curso_id
           FROM seccion s
           JOIN curso c ON c.id = s.curso_id AND c.universidad_id = s.universidad_id
           JOIN periodo p ON p.id = c.periodo_id AND p.activo
          WHERE s.archived_at IS NULL AND c.archived_at IS NULL)
       SELECT (SELECT count(DISTINCT (i.universidad_id, i.usuario_id))
                 FROM inscripcion i JOIN del_periodo s ON s.id = i.seccion_id
                WHERE i.archived_at IS NULL) AS alumnos,
              (SELECT count(DISTINCT (universidad_id, curso_id)) FROM del_periodo) AS cursos`,
    )
    expect(m.alumnos).toBe(Number(alumnos))
    expect(m.cursos).toBe(Number(cursos))
  })

  it('coincide con la nota final de NOT-14 y el porcentaje de ASI-05 para los mismos datos', async () => {
    const m = await consolidado()
    // NOT-14: notas finales de las dos secciones, calculadas por el profesor.
    const finales = (
      await Promise.all(
        (
          [
            [PROFESOR, ids.norte],
            [PROFESOR_SUR, ids.sur],
          ] as const
        ).map(([correo, seccion]) =>
          obtener<NotasFinalesSeccion>(
            correo,
            `/api/espacio/secciones/${seccion}/notas-finales`,
          ),
        ),
      )
    )
      .flatMap((r) => r.alumnos.map((a) => a.notaFinal))
      .filter((n) => n.tipo === 'FINAL' && n.nota !== null)
    const notas = finales.map((n) => n.nota as number)
    expect(m.promedio.alumnos).toBe(notas.length)
    expect(m.promedio.valor).toBe(
      Math.round((notas.reduce((a, b) => a + b, 0) / notas.length) * 100) / 100,
    )
    expect(m.aprobacion.aprobados).toBe(notas.filter((n) => n >= 4).length)
    // ASI-05: asistidas de cada alumno sobre las clases registradas.
    const resumenes = await Promise.all(
      (
        [
          [PROFESOR, ids.norte],
          [PROFESOR_SUR, ids.sur],
        ] as const
      ).map(([correo, seccion]) =>
        obtener<ResumenAsistenciaSeccion>(
          correo,
          `/api/espacio/secciones/${seccion}/asistencia/resumen`,
        ),
      ),
    )
    const presentes = resumenes.flatMap((r) =>
      r.alumnos.map((a) => a.asistidas),
    )
    const registros = resumenes.flatMap((r) =>
      r.alumnos.map(() => r.clasesRegistradas),
    )
    expect(m.asistencia.presentes).toBe(presentes.reduce((a, b) => a + b, 0))
    expect(m.asistencia.registros).toBe(registros.reduce((a, b) => a + b, 0))
  })

  it('sin período activo, ni notas finales ni clases registradas, cada indicador es null y no 0', async () => {
    await bd.query('UPDATE periodo SET activo = false')
    try {
      expect(await consolidado()).toEqual({
        periodos: [],
        aprobacion: { valor: null, aprobados: 0, evaluados: 0 },
        promedio: { valor: null, alumnos: 0 },
        asistencia: { valor: null, presentes: 0, registros: 0 },
        alumnos: 0,
        cursos: 0,
      })
    } finally {
      await bd.query(
        `UPDATE periodo SET activo = true WHERE (anio, semestre) = (2026, 2)`,
      )
    }
  })

  // ASI-05 solo cuenta cuentas de alumno vigentes. Archivar la cuenta de Ana
  // sin retirar su inscripción quita sus 2 presentes de 2 registros: de 4 de 7
  // (57,14 %) a 2 de 5 (40 %), como el resumen del profesor.
  it('una cuenta de alumno archivada, con inscripción vigente, sale de la asistencia como en ASI-05', async () => {
    const [{ id: ana }] = await bd.query<{ id: string }[]>(
      `SELECT id FROM usuario WHERE correo LIKE $1 || '%@metricas.test'`,
      [`anametricas.${ids.norte.slice(0, 8)}`],
    )
    await bd.query(`UPDATE usuario SET archived_at = now() WHERE id = $1`, [
      ana,
    ])
    try {
      expect((await consolidado()).asistencia).toEqual({
        valor: 40,
        presentes: 2,
        registros: 5,
      })
      const resumen = await obtener<ResumenAsistenciaSeccion>(
        PROFESOR,
        `/api/espacio/secciones/${ids.norte}/asistencia/resumen`,
      )
      expect(resumen.alumnos.some((a) => a.id === ana)).toBe(false)
    } finally {
      await bd.query(`UPDATE usuario SET archived_at = NULL WHERE id = $1`, [
        ana,
      ])
    }
  })

  it('con el período activo pero sin evaluaciones vigentes, las notas dicen null y la asistencia sigue', async () => {
    const vigentes = (
      await bd.query<{ id: string }[]>(
        `SELECT id FROM evaluacion WHERE archived_at IS NULL`,
      )
    ).map((e) => e.id)
    await bd.query(
      `UPDATE evaluacion SET archived_at = now() WHERE id = ANY($1)`,
      [vigentes],
    )
    try {
      const m = await consolidado()
      expect(m.aprobacion).toEqual({ valor: null, aprobados: 0, evaluados: 0 })
      expect(m.promedio).toEqual({ valor: null, alumnos: 0 })
      expect(m.asistencia.valor).toBe(57.14)
    } finally {
      await bd.query(
        `UPDATE evaluacion SET archived_at = NULL WHERE id = ANY($1)`,
        [vigentes],
      )
    }
  })

  it('incluye en los indicadores un curso archivado de un período cerrado', async () => {
    const [{ curso_id: cursoId }] = await bd.query<{ curso_id: string }[]>(
      'SELECT curso_id FROM seccion WHERE id = $1',
      [ids.norte],
    )
    await bd.query('UPDATE curso SET archived_at = now() WHERE id = $1', [
      cursoId,
    ])
    try {
      expect(await consolidado()).toMatchObject({
        aprobacion: { aprobados: 2, evaluados: 3 },
        promedio: { valor: 4.33, alumnos: 3 },
        asistencia: { presentes: 4, registros: 7 },
      })
    } finally {
      await bd.query('UPDATE curso SET archived_at = NULL WHERE id = $1', [
        cursoId,
      ])
    }
  })

  it.each([
    [PROFESOR, 'PROFESOR'],
    [AYUDANTE, 'AYUDANTE'],
    [ALUMNO, 'ALUMNO'],
    [ADMIN_INGENIERIA, 'ADMINISTRATIVO'],
  ])('%s (%s) recibe 403', async (correo) => {
    await obtener(correo, RUTA, 403)
  })

  // La función SQL replica calcularNotaFinal en los casos límite: sin
  // evaluaciones, nada evaluado, parcial, redondeo de la mitad hacia arriba y
  // ponderaciones que no suman 100.
  it.each([
    [[], []],
    [
      [60, 40],
      [null, null],
    ],
    [
      [60, 40],
      [5.0, null],
    ],
    [
      [60, 40],
      [5.0, 6.0],
    ],
    [
      [50, 50],
      [5.0, 5.1],
    ],
    [
      [30, 30],
      [4.0, 4.1],
    ],
    [[100], [3.95]],
    [
      [1, 99],
      [7.0, 1.0],
    ],
  ] as [number[], (number | null)[]][])(
    'nota_final(%j, %j) da lo mismo que calcularNotaFinal',
    async (ponderaciones, notas) => {
      const [fila] = await bd.query<
        { tipo: string; nota: string | null; porcentaje_evaluado: number }[]
      >('SELECT * FROM nota_final($1::integer[], $2::numeric[])', [
        ponderaciones,
        notas,
      ])
      const esperado = calcularNotaFinal(
        ponderaciones.map((ponderacion, i) => ({
          ponderacion,
          nota: notas[i],
        })),
      )
      expect({
        tipo: fila.tipo,
        nota: fila.nota === null ? null : Number(fila.nota),
        porcentajeEvaluado: fila.porcentaje_evaluado,
      }).toEqual(esperado)
    },
  )
})

// MET-04: drill-down con el escenario de MET-01. Norte: Ana (5,4) aprueba y
// Bruno (3,6) reprueba, 4 presentes de 6 registros. Sur: Elena (4,0) aprueba,
// 0 presentes de 1 registro. Cada sección es del primer curso de su
// universidad, así que sus indicadores caen en una sola facultad.
describe('drill-down de universidad a facultad (MET-04)', () => {
  const universidadId = (dominio: string) =>
    bd
      .query<{ id: string }[]>(
        'SELECT id FROM universidad WHERE dominio_correo = $1',
        [dominio],
      )
      .then((filas) => filas[0].id)
  const facultadDe = (seccionId: string) =>
    bd
      .query<{ id: string }[]>(
        `SELECT ca.facultad_id AS id FROM seccion s
           JOIN curso c ON c.id = s.curso_id
           JOIN carrera ca ON ca.id = c.carrera_id WHERE s.id = $1`,
        [seccionId],
      )
      .then((filas) => filas[0].id)
  const facultades = (id: string, consulta = '', estado = 200) =>
    obtener<MetricasUniversidad>(
      DIRECTOR,
      `${RUTA_UNIVERSIDADES}/${id}/facultades${consulta}`,
      estado,
    )
  const RUTA_UNIVERSIDADES = '/api/metricas/universidades'

  it('lista períodos únicos de todas las universidades, del más reciente al antiguo', async () => {
    const lista = await obtener<
      { anio: number; semestre: number; activo: boolean }[]
    >(DIRECTOR, '/api/metricas/periodos')
    expect(lista).toEqual([
      { anio: 2026, semestre: 2, activo: true },
    ])
  })

  it('lista las universidades con sus indicadores', async () => {
    const lista = await obtener<ResumenUniversidad[]>(
      DIRECTOR,
      RUTA_UNIVERSIDADES,
    )
    const norte = lista.find((u) => u.nombre === 'Universidad Demo Norte')
    const sur = lista.find((u) => u.nombre === 'Universidad Demo Sur')
    expect(norte).toMatchObject({
      periodo: { anio: 2026, semestre: 2 },
      aprobacion: { valor: 50, aprobados: 1, evaluados: 2 },
      promedio: { valor: 4.5, alumnos: 2 },
      asistencia: { valor: 66.67, presentes: 4, registros: 6 },
    })
    expect(sur).toMatchObject({
      aprobacion: { valor: 100, aprobados: 1, evaluados: 1 },
      promedio: { valor: 4, alumnos: 1 },
      asistencia: { valor: 0, presentes: 0, registros: 1 },
    })
    // El consolidado de MET-01 es la suma de los numeradores y denominadores.
    const m = await consolidado()
    expect(m.aprobacion.aprobados).toBe(
      lista.reduce((n, u) => n + u.aprobacion.aprobados, 0),
    )
    expect(m.asistencia.registros).toBe(
      lista.reduce((n, u) => n + u.asistencia.registros, 0),
    )
  })

  it('una universidad muestra sus facultades con los tres indicadores', async () => {
    const norte = await universidadId('norte.cursus.test')
    const conDatos = await facultadDe(ids.norte)
    const r = await facultades(norte)
    expect(r.universidad).toEqual({
      id: norte,
      nombre: 'Universidad Demo Norte',
    })
    expect(r.periodo).toEqual({ anio: 2026, semestre: 2 })
    const propia = r.facultades.find((f) => f.id === conDatos)
    expect(propia).toMatchObject({
      aprobacion: { valor: 50, aprobados: 1, evaluados: 2 },
      promedio: { valor: 4.5, alumnos: 2 },
      asistencia: { valor: 66.67, presentes: 4, registros: 6 },
    })
    // Las demás facultades de Norte no tienen estas notas ni clases: null y no 0.
    for (const f of r.facultades.filter((f) => f.id !== conDatos)) {
      expect(f.aprobacion.valor).toBeNull()
      expect(f.promedio.valor).toBeNull()
      expect(f.asistencia.valor).toBeNull()
    }
    // Las facultades suman lo de la universidad.
    expect(r.facultades.reduce((n, f) => n + f.aprobacion.evaluados, 0)).toBe(2)
    const [{ vigentes }] = await bd.query<{ vigentes: string }[]>(
      `SELECT count(*) AS vigentes FROM facultad
        WHERE universidad_id = $1 AND archived_at IS NULL`,
      [norte],
    )
    expect(r.facultades).toHaveLength(Number(vigentes))
  })

  it('las facultades de otra universidad no se mezclan', async () => {
    const sur = await universidadId('sur.cursus.test')
    const conDatos = await facultadDe(ids.sur)
    const r = await facultades(sur)
    expect(r.universidad.nombre).toBe('Universidad Demo Sur')
    expect(r.facultades.find((f) => f.id === conDatos)).toMatchObject({
      aprobacion: { valor: 100, aprobados: 1, evaluados: 1 },
    })
    expect(r.facultades.reduce((n, f) => n + f.aprobacion.evaluados, 0)).toBe(1)
  })

  it('una facultad sin datos aparece con indicadores null y archivada no se lista', async () => {
    const norte = await universidadId('norte.cursus.test')
    const [{ id }] = await bd.query<{ id: string }[]>(
      `INSERT INTO facultad (universidad_id, nombre) VALUES ($1, 'Facultad vacía')
       RETURNING id`,
      [norte],
    )
    const ver = async () =>
      (await facultades(norte)).facultades.find((f) => f.id === id)
    expect(await ver()).toMatchObject({
      aprobacion: { valor: null, aprobados: 0, evaluados: 0 },
      promedio: { valor: null, alumnos: 0 },
      asistencia: { valor: null, presentes: 0, registros: 0 },
      alumnos: 0,
      cursos: 0,
    })
    await bd.query('UPDATE facultad SET archived_at = now() WHERE id = $1', [
      id,
    ])
    expect(await ver()).toBeUndefined()
  })

  it('el período de la URL filtra: el pedido igual al activo da lo mismo y uno inexistente, null', async () => {
    const norte = await universidadId('norte.cursus.test')
    expect(await facultades(norte, '?periodo=2026-2')).toEqual(
      await facultades(norte),
    )
    const vacio = await facultades(norte, '?periodo=2020-1')
    expect(vacio.periodo).toBeNull()
    expect(
      vacio.facultades.every(
        (f) => f.aprobacion.valor === null && f.asistencia.valor === null,
      ),
    ).toBe(true)
    const lista = await obtener<ResumenUniversidad[]>(
      DIRECTOR,
      `${RUTA_UNIVERSIDADES}?periodo=2020-1`,
    )
    expect(lista.every((u) => u.periodo === null)).toBe(true)
  })

  it('el consolidado usa el mismo período que los otros niveles', async () => {
    // El pedido igual al activo da lo mismo; uno sin datos ni período, vacío.
    expect(
      await obtener<MetricasConsolidadas>(DIRECTOR, `${RUTA}?periodo=2026-2`),
    ).toEqual(await consolidado())
    expect(
      await obtener<MetricasConsolidadas>(DIRECTOR, `${RUTA}?periodo=2020-1`),
    ).toEqual({
      periodos: [],
      aprobacion: { valor: null, aprobados: 0, evaluados: 0 },
      promedio: { valor: null, alumnos: 0 },
      asistencia: { valor: null, presentes: 0, registros: 0 },
      alumnos: 0,
      cursos: 0,
    })
    await obtener(DIRECTOR, `${RUTA}?periodo=activo`, 400)
  })

  it.each([
    [
      'una universidad inexistente',
      '00000000-0000-4000-8000-0000000000aa',
      404,
    ],
    ['un id que no es UUID', 'no-es-uuid', 400],
  ])('%s', async (_q, id, estado) => {
    await obtener(DIRECTOR, `${RUTA_UNIVERSIDADES}/${id}/facultades`, estado)
  })

  it('una universidad archivada da 404', async () => {
    const sur = await universidadId('sur.cursus.test')
    await bd.query('UPDATE universidad SET archived_at = now() WHERE id = $1', [
      sur,
    ])
    try {
      await facultades(sur, '', 404)
    } finally {
      await bd.query(
        'UPDATE universidad SET archived_at = NULL WHERE id = $1',
        [sur],
      )
    }
  })

  it('un período con formato inválido da 400', async () => {
    const norte = await universidadId('norte.cursus.test')
    await facultades(norte, '?periodo=activo', 400)
    await obtener(DIRECTOR, `${RUTA_UNIVERSIDADES}?periodo=2026`, 400)
  })

  it.each([[PROFESOR], [AYUDANTE], [ALUMNO], [ADMIN_INGENIERIA]])(
    '%s recibe 403 en ambos niveles',
    async (correo) => {
      const norte = await universidadId('norte.cursus.test')
      await obtener(correo, RUTA_UNIVERSIDADES, 403)
      await obtener(correo, `${RUTA_UNIVERSIDADES}/${norte}/facultades`, 403)
    },
  )
})
