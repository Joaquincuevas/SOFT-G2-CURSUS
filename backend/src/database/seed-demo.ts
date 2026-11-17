import { SUMA_PONDERACIONES_REQUERIDA } from '@cursus/shared'
import type { EntityManager } from 'typeorm'
import { CARRERAS_DEMO, DOMINIO_DEMO, FACULTAD_DEMO } from './seed-facultad.js'
import type { Rol, UsuarioSeed } from './seed.js'

// Capa de demo del seed: hace que la aplicación se vea como una universidad en
// funcionamiento. Agrega más personas a cada facultad, períodos anteriores
// cerrados con su historial y, en el período activo, evaluaciones, notas en
// distintos estados, clases con asistencia, anuncios y actividades.
//
// Solo la carga el CLI (npm run seed); las fixtures de los tests de otras
// historias no la usan. Todo es determinista salvo los UUID, y se puede
// repetir: un período cerrado que ya existe no se toca, y una sección que ya
// tiene evaluaciones tampoco.

const ZONA = 'America/Santiago'

// --- Facultades y períodos --------------------------------------------------

interface CursoDemo {
  codigo: string
  nombre: string
}

interface CarreraDemo {
  nombre: string
  cursos: readonly CursoDemo[]
}

export interface PeriodoDemo {
  anio: number
  semestre: number
  inicio: string
  termino: string
  // Semana sin clases (receso o Fiestas Patrias), de lunes a viernes.
  receso: string
}

export interface PeriodoCerradoDemo extends PeriodoDemo {
  // Los cursos del período quedan además archivados (HIS-03).
  archivar: boolean
}

export const PERIODOS_CERRADOS: PeriodoCerradoDemo[] = [
  {
    anio: 2025,
    semestre: 1,
    inicio: '2025-03-03',
    termino: '2025-07-11',
    receso: '2025-04-14',
    archivar: true,
  },
  {
    anio: 2025,
    semestre: 2,
    inicio: '2025-08-04',
    termino: '2025-12-12',
    receso: '2025-09-15',
    archivar: false,
  },
  {
    anio: 2026,
    semestre: 1,
    inicio: '2026-03-02',
    termino: '2026-07-10',
    receso: '2026-04-06',
    archivar: false,
  },
]

// Receso del período activo (2026-2, el del seed base): Fiestas Patrias.
const RECESO_ACTIVO = '2026-09-14'

interface FacultadDemo {
  dominio: string
  facultad: string
  prefijoSala: string
  carreras: readonly CarreraDemo[]
  // Personas que se suman a las de GES-22 (3 profesores, 4 ayudantes y 25
  // alumnos por facultad).
  extra: Record<'PROFESOR' | 'AYUDANTE' | 'ALUMNO', number>
  periodosCerrados: PeriodoCerradoDemo[]
  // Ingeniería de Norte ya tiene sus secciones del período activo completas
  // (GES-20); en las demás las completa esta capa.
  activoPorGes20: boolean
}

export const FACULTADES_DEMO: FacultadDemo[] = [
  {
    dominio: DOMINIO_DEMO,
    facultad: FACULTAD_DEMO,
    prefijoSala: 'ING',
    carreras: CARRERAS_DEMO,
    extra: { PROFESOR: 8, AYUDANTE: 8, ALUMNO: 150 },
    periodosCerrados: PERIODOS_CERRADOS,
    activoPorGes20: true,
  },
  {
    dominio: DOMINIO_DEMO,
    facultad: 'Facultad de Economía y Negocios',
    prefijoSala: 'ECO',
    carreras: [
      {
        nombre: 'Ingeniería Comercial',
        cursos: [
          { codigo: 'ICO101', nombre: 'Introducción a la Economía' },
          { codigo: 'ICO201', nombre: 'Contabilidad' },
          { codigo: 'ICO202', nombre: 'Microeconomía' },
          { codigo: 'ICO203', nombre: 'Finanzas Corporativas' },
          { codigo: 'ICO204', nombre: 'Marketing' },
        ],
      },
    ],
    extra: { PROFESOR: 2, AYUDANTE: 2, ALUMNO: 40 },
    periodosCerrados: [PERIODOS_CERRADOS[2]],
    activoPorGes20: false,
  },
  {
    dominio: 'sur.cursus.test',
    facultad: 'Facultad de Ciencias de la Salud',
    prefijoSala: 'SAL',
    carreras: [
      {
        nombre: 'Enfermería',
        cursos: [
          { codigo: 'ENF101', nombre: 'Fundamentos de Enfermería' },
          { codigo: 'ENF201', nombre: 'Anatomía y Fisiología' },
          { codigo: 'ENF202', nombre: 'Farmacología' },
          { codigo: 'ENF203', nombre: 'Salud Pública' },
          { codigo: 'ENF204', nombre: 'Enfermería Médico-Quirúrgica' },
        ],
      },
    ],
    extra: { PROFESOR: 2, AYUDANTE: 2, ALUMNO: 40 },
    periodosCerrados: [PERIODOS_CERRADOS[2]],
    activoPorGes20: false,
  },
]

// --- Usuarios de la tabla del README ------------------------------------------

// Los usuarios con los que se entra a la demo (Ingeniería de Norte) tienen
// carga real: secciones vigentes y una trayectoria en los períodos cerrados.
// Los códigos son de la sección 1 de cada curso.
export const FIJOS = {
  profesor: `profesor@${DOMINIO_DEMO}`,
  ayudante: `ayudante@${DOMINIO_DEMO}`,
  alumno: `alumno@${DOMINIO_DEMO}`,
}

interface TrayectoriaPeriodo {
  alumno: string[]
  // Único profesor de la sección.
  profesor: string[]
  // Profesor junto con el que ya tenía la sección (GES-25).
  coprofesor: string[]
  ayudante: string[]
}

export const TRAYECTORIA: Record<string, TrayectoriaPeriodo> = {
  '2025-1': {
    alumno: ['ICC101', 'ICI101', 'IEL101'],
    profesor: ['ICC101'],
    coprofesor: [],
    ayudante: [],
  },
  '2025-2': {
    alumno: ['ICC201', 'ICI202', 'IEL201'],
    profesor: ['ICC201', 'ICC204'],
    coprofesor: [],
    ayudante: [],
  },
  '2026-1': {
    alumno: ['ICC201', 'ICI203', 'IEL202'],
    profesor: ['ICC201', 'ICC202'],
    coprofesor: [],
    ayudante: ['ICC101'],
  },
  '2026-2': {
    alumno: ['ICC202', 'ICC203', 'ICC204', 'ICI204', 'IEL203'],
    profesor: ['ICC202', 'ICC204'],
    coprofesor: ['ICC203'],
    ayudante: ['ICC202', 'ICC204'],
  },
}

// Estado de la última evaluación rendida en las secciones de los usuarios
// fijos, para mostrar cada paso del flujo de notas (NOT-08 a NOT-12).
const ESTADO_FIJO: Record<string, EstadoRevision> = {
  ICC202: 'BORRADOR',
  ICC204: 'EN_REVISION',
  ICC203: 'DEVUELTA',
}

// Rendimiento del alumno fijo: le fue bien, salvo la primera vez que tomó
// Estructuras de Datos.
const CAPACIDAD_FIJA = 5.6
const REPROBADO_FIJO = { periodo: '2025-2', codigo: 'ICC201', capacidad: 3.1 }

// --- Nombres --------------------------------------------------------------------

// Distintos de los de GES-22 (nombre.apellido): estos usan dos apellidos, así
// que sus correos (nombre.apellido.apellido) nunca coinciden con los de ella.
const NOMBRES = [
  'Ana',
  'Pedro',
  'Carolina',
  'Rodrigo',
  'Paula',
  'Andrés',
  'Macarena',
  'Pablo',
  'Bárbara',
  'Gonzalo',
  'Carla',
  'Esteban',
  'Natalia',
  'Rafael',
  'Pía',
  'Simón',
  'Rocío',
  'Álvaro',
  'Belén',
  'Martín',
  'Claudia',
  'Hugo',
  'Elisa',
  'Raúl',
  'Teresa',
  'Óscar',
  'Victoria',
  'Emilio',
  'Paz',
  'Julián',
  'Amparo',
  'León',
  'Fernando',
  'Gabriela',
  'Mateo',
  'Renata',
  'Ricardo',
  'Alejandra',
  'Bruno',
  'Inés',
]
const APELLIDOS = [
  'González',
  'Pérez',
  'Vargas',
  'Jara',
  'Carrasco',
  'Cortés',
  'Gómez',
  'Núñez',
  'Herrera',
  'Medina',
  'Aguilera',
  'Bravo',
  'Cáceres',
  'Saavedra',
  'Vera',
  'Figueroa',
  'Riquelme',
  'Navarro',
  'Olivares',
  'Peña',
  'Salazar',
  'Orellana',
  'Molina',
  'Campos',
  'Fuentealba',
  'Garrido',
  'Lagos',
  'Henríquez',
  'Miranda',
  'Toro',
  'Ortiz',
  'Ibarra',
  'Moya',
  'Cárdenas',
  'Gallardo',
  'Leiva',
  'Valdés',
  'Zúñiga',
  'Parra',
  'Rivera',
]

const paraCorreo = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

// Personas extra de una universidad, en el formato del seed base. Se generan
// siempre iguales y sin repetir correos.
export function usuariosExtraDeDemo(dominio: string): UsuarioSeed[] {
  const usuarios: UsuarioSeed[] = []
  const usados = new Set<string>()
  let k = dominio === DOMINIO_DEMO ? 0 : 977
  for (const facultad of FACULTADES_DEMO.filter((f) => f.dominio === dominio)) {
    for (const [rol, cantidad] of Object.entries(facultad.extra)) {
      for (let i = 0; i < cantidad; k++) {
        const nombre = NOMBRES[k % NOMBRES.length]
        const primero =
          APELLIDOS[(k * 7 + Math.floor(k / NOMBRES.length)) % APELLIDOS.length]
        const segundo = APELLIDOS[(k * 13 + 5) % APELLIDOS.length]
        const usuario = [nombre, primero, segundo].map(paraCorreo).join('.')
        if (primero === segundo || usados.has(usuario)) continue
        usados.add(usuario)
        usuarios.push({
          rol: rol as Rol,
          nombre: `${nombre} ${primero} ${segundo}`,
          usuario,
          facultad: facultad.facultad,
        })
        i++
      }
    }
  }
  return usuarios
}

// --- Utilidades -------------------------------------------------------------------

// FNV-1a de 32 bits: un "azar" estable para que cada ejecución dé lo mismo.
function azar(...partes: string[]): number {
  let h = 0x811c9dc5
  for (const c of partes.join('|')) {
    h ^= c.codePointAt(0) ?? 0
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

const DIA_MS = 24 * 60 * 60 * 1000
function sumarDias(fecha: string, dias: number): string {
  return new Date(Date.parse(`${fecha}T00:00:00Z`) + dias * DIA_MS)
    .toISOString()
    .slice(0, 10)
}
// 1 = lunes ... 7 = domingo, como horario_seccion.dia.
function diaSemana(fecha: string): number {
  return new Date(`${fecha}T00:00:00Z`).getUTCDay() || 7
}

// Fecha de hoy en Chile (YYYY-MM-DD).
export function hoyEnChile(ahora = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(ahora)
}

const clavePeriodo = (p: { anio: number; semestre: number }) =>
  `${p.anio}-${p.semestre}`

const redondear = (valor: number) =>
  Math.round(Math.min(7, Math.max(1, valor)) * 10) / 10

// --- Horarios -------------------------------------------------------------------

interface Bloque {
  dia: number
  inicio: string
  termino: string
  sala: string
}

// Mismo criterio que GES-20 (seed-facultad.ts): dos encuentros semanales en
// intervalos propios de cada curso, y las secciones a la misma hora en salas
// distintas. Así ningún profesor, ayudante ni alumno tiene topes.
const HORAS = [
  ['08:30', '09:20'],
  ['09:30', '10:20'],
  ['10:30', '11:20'],
  ['11:30', '12:20'],
  ['14:00', '14:50'],
  ['15:00', '15:50'],
] as const
function bloquesDe(
  indiceCurso: number,
  numero: number,
  prefijo: string,
): Bloque[] {
  return [indiceCurso, indiceCurso + 15].map((indice) => ({
    dia: Math.floor(indice / HORAS.length) + 1,
    inicio: HORAS[indice % HORAS.length][0],
    termino: HORAS[indice % HORAS.length][1],
    sala: `${prefijo}-10${numero}`,
  }))
}

// --- Contexto de una facultad ---------------------------------------------------

interface Persona {
  id: string
  correo: string
}

interface Contexto {
  f: FacultadDemo
  universidad: string
  facultad: string
  administrativo: string
  carreras: Map<string, string>
  profesores: Persona[]
  ayudantes: Persona[]
  // Alumnos por carrera, con el mismo reparto que GES-20 (por correo).
  alumnosPorCarrera: Persona[][]
  fijos: Map<string, string>
}

async function cargarContexto(
  m: EntityManager,
  f: FacultadDemo,
): Promise<Contexto | null> {
  const [base] = await m.query<{ universidad: string; facultad: string }[]>(
    `SELECT u.id AS universidad, fa.id AS facultad
       FROM universidad u JOIN facultad fa ON fa.universidad_id = u.id
      WHERE u.dominio_correo = $1 AND fa.nombre = $2
        AND u.archived_at IS NULL AND fa.archived_at IS NULL`,
    [f.dominio, f.facultad],
  )
  if (!base) return null
  const usuarios = await m.query<(Persona & { rol: Rol })[]>(
    `SELECT id, correo, rol FROM usuario
      WHERE universidad_id = $1 AND facultad_id = $2 AND archived_at IS NULL
      ORDER BY correo`,
    [base.universidad, base.facultad],
  )
  const fijos = new Map(
    usuarios
      .filter((u) => Object.values(FIJOS).includes(u.correo))
      .map((u) => [u.correo, u.id]),
  )
  // Solo las personas de demo: los usuarios de la tabla del README se asignan
  // aparte, con su trayectoria.
  const deRol = (rol: Rol) =>
    usuarios
      .filter((u) => u.rol === rol && u.correo.split('@')[0].includes('.'))
      .map(({ id, correo }) => ({ id, correo }))
  const alumnos = deRol('ALUMNO')
  const administrativo = usuarios.find((u) => u.rol === 'ADMINISTRATIVO')
  if (!administrativo) {
    throw new Error(`La ${f.facultad} de ${f.dominio} no tiene administrativo`)
  }
  const carreras = await m.query<{ id: string; nombre: string }[]>(
    `SELECT id, nombre FROM carrera
      WHERE facultad_id = $1 AND archived_at IS NULL`,
    [base.facultad],
  )
  return {
    f,
    ...base,
    administrativo: administrativo.id,
    carreras: new Map(carreras.map((c) => [c.nombre, c.id])),
    profesores: deRol('PROFESOR'),
    ayudantes: deRol('AYUDANTE'),
    alumnosPorCarrera: f.carreras.map((_, i) =>
      alumnos.filter((_, j) => j % f.carreras.length === i),
    ),
    fijos,
  }
}

// --- Secciones --------------------------------------------------------------------

interface Asignacion {
  profesores: string[]
  ayudantes: string[]
  alumnos: string[]
}

async function poblarSeccion(
  m: EntityManager,
  ctx: Contexto,
  seccion: string,
  bloques: Bloque[],
  a: Asignacion,
  desde: string,
) {
  const creado = `${desde} 09:00`
  for (const b of bloques) {
    await m.query(
      `INSERT INTO horario_seccion (universidad_id, seccion_id, dia, inicio, termino, sala)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [ctx.universidad, seccion, b.dia, b.inicio, b.termino, b.sala],
    )
  }
  await m.query(`UPDATE seccion SET horario_version = 1 WHERE id = $1`, [
    seccion,
  ])
  // seccion_profesor actualiza seccion.profesor_id (GES-25).
  for (const profesor of a.profesores) {
    await m.query(
      `INSERT INTO seccion_profesor (universidad_id, seccion_id, usuario_id)
       VALUES ($1, $2, $3)`,
      [ctx.universidad, seccion, profesor],
    )
  }
  await m.query(
    `INSERT INTO ayudante_seccion (universidad_id, seccion_id, usuario_id, created_at)
     SELECT $1, $2, unnest($3::uuid[]), $4::timestamp AT TIME ZONE '${ZONA}'`,
    [ctx.universidad, seccion, a.ayudantes, creado],
  )
  await m.query(
    `INSERT INTO inscripcion (universidad_id, seccion_id, usuario_id, created_at)
     SELECT $1, $2, unnest($3::uuid[]), $4::timestamp AT TIME ZONE '${ZONA}'`,
    [ctx.universidad, seccion, a.alumnos, creado],
  )
}

// Reparto de un curso en un período: profesores y ayudantes rotan entre cursos
// y períodos, y cada alumno de la carrera toma el curso con cierta
// probabilidad, en una de las dos secciones.
function asignacionDe(
  ctx: Contexto,
  periodo: string,
  indiceCarrera: number,
  indiceCurso: number,
  codigo: string,
  numero: number,
): Asignacion {
  const desfase = azar(periodo) % 7
  const { profesores, ayudantes } = ctx
  const profesor =
    profesores[(indiceCurso * 2 + numero - 1 + desfase) % profesores.length]
  const ayudantesSeccion = [0, 1].map(
    (j) =>
      ayudantes[
        (indiceCurso * 4 + (numero - 1) * 2 + j + desfase) % ayudantes.length
      ].id,
  )
  const alumnos = ctx.alumnosPorCarrera[indiceCarrera]
    .filter(
      (a) =>
        azar(a.correo, periodo, codigo) % 100 < 65 &&
        (azar(a.correo, periodo, codigo, 'seccion') % 2) + 1 === numero,
    )
    .map((a) => a.id)
  return { profesores: [profesor.id], ayudantes: ayudantesSeccion, alumnos }
}

// Ajusta una asignación con la trayectoria de los usuarios fijos (sección 1).
function conFijos(
  ctx: Contexto,
  periodo: string,
  codigo: string,
  numero: number,
  a: Asignacion,
): Asignacion {
  const t = TRAYECTORIA[periodo]
  if (!t || numero !== 1 || ctx.fijos.size === 0) return a
  const profesor = ctx.fijos.get(FIJOS.profesor)
  const ayudante = ctx.fijos.get(FIJOS.ayudante)
  const alumno = ctx.fijos.get(FIJOS.alumno)
  return {
    profesores:
      profesor && t.profesor.includes(codigo) ? [profesor] : a.profesores,
    ayudantes:
      ayudante && t.ayudante.includes(codigo)
        ? [ayudante, ...a.ayudantes.slice(1)]
        : a.ayudantes,
    alumnos:
      alumno && t.alumno.includes(codigo) ? [alumno, ...a.alumnos] : a.alumnos,
  }
}

// --- Registro académico de una sección ------------------------------------------

type EstadoRevision = 'BORRADOR' | 'EN_REVISION' | 'APROBADA' | 'DEVUELTA'

const EVALUACIONES = [
  { nombre: 'Control 1', semana: 4, ponderacion: 15 },
  { nombre: 'Prueba 1', semana: 7, ponderacion: 25 },
  { nombre: 'Control 2', semana: 11, ponderacion: 15 },
  { nombre: 'Prueba 2', semana: 14, ponderacion: 25 },
  { nombre: 'Examen', semana: -1, ponderacion: 20 },
] as const

if (
  EVALUACIONES.reduce((n, e) => n + e.ponderacion, 0) !==
  SUMA_PONDERACIONES_REQUERIDA
) {
  throw new Error('Las ponderaciones de la demo deben sumar el total requerido')
}

const COMENTARIO_DEVOLUCION =
  'Revisa las notas de la pregunta 3: hay puntajes que no coinciden con la pauta. Corrígelas y vuelve a enviarlas.'

export function fechasEvaluaciones(p: PeriodoDemo): string[] {
  return EVALUACIONES.map((e) =>
    e.semana < 0
      ? sumarDias(p.termino, -4)
      : sumarDias(p.inicio, e.semana * 7 + 2),
  )
}

interface SeccionDemo {
  id: string
  curso: string
  codigo: string
  numero: number
  periodo: string
  profesor: string
  ayudante: string
  alumnos: Persona[]
  bloques: Bloque[]
}

async function seccionesDe(
  m: EntityManager,
  ctx: Contexto,
  periodoId: string,
  clave: string,
): Promise<SeccionDemo[]> {
  const filas = await m.query<
    {
      id: string
      curso: string
      codigo: string
      numero: number
      profesor: string | null
      ayudante: string | null
      alumnos: Persona[]
      bloques: Bloque[]
    }[]
  >(
    `SELECT s.id, c.id AS curso, c.codigo, s.numero, s.profesor_id AS profesor,
            (SELECT a.usuario_id FROM ayudante_seccion a
              WHERE a.seccion_id = s.id AND a.archived_at IS NULL
              ORDER BY a.created_at, a.id LIMIT 1) AS ayudante,
            coalesce((SELECT json_agg(json_build_object('id', u.id, 'correo', u.correo) ORDER BY u.correo)
                        FROM inscripcion i JOIN usuario u ON u.id = i.usuario_id
                       WHERE i.seccion_id = s.id AND i.archived_at IS NULL
                         AND u.archived_at IS NULL AND u.rol = 'ALUMNO'), '[]') AS alumnos,
            coalesce((SELECT json_agg(json_build_object('dia', h.dia, 'inicio', to_char(h.inicio, 'HH24:MI'),
                                                        'termino', to_char(h.termino, 'HH24:MI'), 'sala', h.sala)
                                      ORDER BY h.dia, h.inicio)
                        FROM horario_seccion h
                       WHERE h.seccion_id = s.id AND h.archived_at IS NULL), '[]') AS bloques
       FROM seccion s
       JOIN curso c ON c.id = s.curso_id
       JOIN carrera ca ON ca.id = c.carrera_id
      WHERE ca.facultad_id = $1 AND c.periodo_id = $2
        AND s.archived_at IS NULL AND c.archived_at IS NULL
      ORDER BY c.codigo, s.numero`,
    [ctx.facultad, periodoId],
  )
  return filas
    .filter((s) => s.profesor)
    .map((s) => ({
      ...s,
      periodo: clave,
      profesor: s.profesor as string,
      ayudante: s.ayudante ?? (s.profesor as string),
    }))
}

function capacidad(correo: string, periodo: string, codigo: string): number {
  if (correo === FIJOS.alumno) {
    return periodo === REPROBADO_FIJO.periodo &&
      codigo === REPROBADO_FIJO.codigo
      ? REPROBADO_FIJO.capacidad
      : CAPACIDAD_FIJA
  }
  // Entre 3,2 y 6,6, con un leve ajuste por curso.
  return 3.2 + (azar(correo) % 35) / 10 + ((azar(correo, codigo) % 7) - 3) / 10
}

async function sembrarRegistroAcademico(
  m: EntityManager,
  ctx: Contexto,
  s: SeccionDemo,
  p: PeriodoDemo,
  hoy: string,
  cerrado: boolean,
  estadoUltima: EstadoRevision,
) {
  const u = ctx.universidad
  // Evaluaciones, creadas al comienzo del semestre.
  const fechas = fechasEvaluaciones(p)
  const evaluaciones = await m.query<{ id: string; nombre: string }[]>(
    `INSERT INTO evaluacion (universidad_id, seccion_id, nombre, fecha, ponderacion, creada_por, created_at, updated_at)
     SELECT $1, $2, n, f, pond, $3, c, c
       FROM unnest($4::text[], $5::date[], $6::smallint[]) AS t(n, f, pond),
            LATERAL (SELECT ($7::date + time '10:00') AT TIME ZONE '${ZONA}' AS c) x
     RETURNING id, nombre`,
    [
      u,
      s.id,
      s.profesor,
      EVALUACIONES.map((e) => e.nombre),
      fechas,
      EVALUACIONES.map((e) => e.ponderacion),
      sumarDias(p.inicio, 3),
    ],
  )
  const idDe = new Map(evaluaciones.map((e) => [e.nombre, e.id]))
  const rendidas = EVALUACIONES.map((e, i) => ({ ...e, fecha: fechas[i] }))
    .filter((e) => cerrado || e.fecha < hoy)
    .map((e) => ({ ...e, id: idDe.get(e.nombre) as string }))

  for (const [i, e] of rendidas.entries()) {
    const ultima = i === rendidas.length - 1
    const estado: EstadoRevision =
      cerrado || !ultima ? 'APROBADA' : estadoUltima
    // En borrador, el ayudante aún no termina de ingresar las notas.
    const alumnos =
      estado === 'BORRADOR'
        ? s.alumnos.filter(
            (a) => azar(a.correo, s.codigo, e.nombre, 'borrador') % 10 < 7,
          )
        : s.alumnos
    const valores = alumnos.map((a) =>
      redondear(
        capacidad(a.correo, s.periodo, s.codigo) +
          ((azar(a.correo, s.periodo, s.codigo, e.nombre) % 21) - 10) / 10,
      ),
    )
    const propuesta = `${sumarDias(e.fecha, 5)} 18:00`
    const envio = `${sumarDias(e.fecha, 6)} 12:00`
    const decision = `${sumarDias(e.fecha, 7)} 16:30`
    await m.query(
      `INSERT INTO nota (universidad_id, evaluacion_id, alumno_id, valor, estado, propuesta_por, created_at, updated_at)
       SELECT $1, $2, a, v, $3, $4, c, c
         FROM unnest($5::uuid[], $6::numeric[]) AS t(a, v),
              LATERAL (SELECT $7::timestamp AT TIME ZONE '${ZONA}' AS c) x`,
      [
        u,
        e.id,
        estado === 'APROBADA' ? 'PUBLICADA' : 'PROPUESTA',
        s.ayudante,
        alumnos.map((a) => a.id),
        valores,
        propuesta,
      ],
    )
    await m.query(
      `INSERT INTO nota_cambio (universidad_id, evaluacion_id, alumno_id, tipo, nota_nueva, responsable_id, fecha)
       SELECT $1, $2, a, 'PROPUESTA', v, $3, $6::timestamp AT TIME ZONE '${ZONA}'
         FROM unnest($4::uuid[], $5::numeric[]) AS t(a, v)`,
      [u, e.id, s.ayudante, alumnos.map((a) => a.id), valores, propuesta],
    )
    const eventos: [string, string, string, string | null][] = []
    if (estado !== 'BORRADOR') eventos.push(['ENVIO', s.ayudante, envio, null])
    if (estado === 'APROBADA') {
      eventos.push(['APROBACION', s.profesor, decision, null])
    }
    if (estado === 'DEVUELTA') {
      eventos.push(['DEVOLUCION', s.profesor, decision, COMENTARIO_DEVOLUCION])
    }
    for (const [tipo, responsable, fecha, motivo] of eventos) {
      await m.query(
        `INSERT INTO nota_cambio (universidad_id, evaluacion_id, tipo, motivo, responsable_id, fecha)
         VALUES ($1, $2, $3, $4, $5, $6::timestamp AT TIME ZONE '${ZONA}')`,
        [u, e.id, tipo, motivo, responsable, fecha],
      )
    }
    const ultimoEvento = eventos.at(-1)
    await m.query(
      `INSERT INTO revision_notas (universidad_id, evaluacion_id, estado, actualizado_por, comentario_devolucion, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6::timestamp AT TIME ZONE '${ZONA}', $7::timestamp AT TIME ZONE '${ZONA}')`,
      [
        u,
        e.id,
        estado,
        ultimoEvento?.[1] ?? s.ayudante,
        estado === 'DEVUELTA' ? COMENTARIO_DEVOLUCION : null,
        propuesta,
        ultimoEvento?.[2] ?? propuesta,
      ],
    )
  }

  // Clases según el horario, sin la semana de receso. En el período activo,
  // hasta ayer; la asistencia de los últimos días queda por marcar.
  const receso = new Set([0, 1, 2, 3, 4].map((d) => sumarDias(p.receso, d)))
  const hasta = cerrado ? p.termino : sumarDias(hoy, -1)
  const clases: { fecha: string; bloque: Bloque }[] = []
  for (let f = p.inicio; f <= hasta && f <= p.termino; f = sumarDias(f, 1)) {
    if (receso.has(f)) continue
    for (const b of s.bloques.filter((b) => b.dia === diaSemana(f))) {
      clases.push({ fecha: f, bloque: b })
    }
  }
  if (clases.length === 0) return
  const creadas = await m.query<
    { id: string; fecha: string; inicio: string }[]
  >(
    `INSERT INTO clase (universidad_id, seccion_id, fecha, inicio, termino, sala, creada_por, created_at, updated_at)
     SELECT $1, $2, f, i, t, sa, $3, c, c
       FROM unnest($4::date[], $5::time[], $6::time[], $7::text[]) AS x(f, i, t, sa),
            LATERAL (SELECT (f + i) AT TIME ZONE '${ZONA}' AS c) y
     RETURNING id, to_char(fecha, 'YYYY-MM-DD') AS fecha, to_char(inicio, 'HH24:MI') AS inicio`,
    [
      u,
      s.id,
      s.profesor,
      clases.map((c) => c.fecha),
      clases.map((c) => c.bloque.inicio),
      clases.map((c) => c.bloque.termino),
      clases.map((c) => c.bloque.sala),
    ],
  )
  const conAsistencia = creadas.filter(
    (c) => cerrado || c.fecha < sumarDias(hoy, -3),
  )
  const filas = conAsistencia.flatMap((c) =>
    s.alumnos.map((a) => {
      const tasa =
        a.correo === FIJOS.alumno
          ? 92
          : 60 + (azar(a.correo, 'asistencia') % 39)
      return {
        clase: c.id,
        alumno: a.id,
        presente: azar(a.correo, c.fecha, c.inicio) % 100 < tasa,
      }
    }),
  )
  if (filas.length === 0) return
  await m.query(
    `INSERT INTO asistencia (universidad_id, clase_id, alumno_id, presente, registrada_por, created_at, updated_at)
     SELECT $1, x.c, x.a, x.p, $2, (cl.fecha + cl.termino) AT TIME ZONE '${ZONA}',
            (cl.fecha + cl.termino) AT TIME ZONE '${ZONA}'
       FROM unnest($3::uuid[], $4::uuid[], $5::boolean[]) AS x(c, a, p)
       JOIN clase cl ON cl.id = x.c`,
    [
      u,
      s.profesor,
      filas.map((f) => f.clase),
      filas.map((f) => f.alumno),
      filas.map((f) => f.presente),
    ],
  )
}

// --- Anuncios y actividades ------------------------------------------------------

interface AnuncioDemo {
  titulo: string
  cuerpo: string
  fecha: string
  // Número de la sección a la que va dirigido; sin él, a todo el curso.
  seccion?: number
}

function anunciosDe(
  nombre: string,
  p: PeriodoDemo,
  hoy: string,
): AnuncioDemo[] {
  const [control1, prueba1] = fechasEvaluaciones(p)
  const anuncios: AnuncioDemo[] = [
    {
      titulo: `Bienvenidos a ${nombre}`,
      cuerpo:
        'Les doy la bienvenida al curso. Las clases comienzan esta semana según el horario publicado. Pueden consultarme después de clases o en el horario de atención, los martes de 15:00 a 16:00.',
      fecha: `${sumarDias(p.inicio, 0)} 08:00`,
    },
    {
      titulo: 'Calendario de evaluaciones',
      cuerpo:
        'Ya está publicado el calendario de evaluaciones del semestre en la pestaña Notas: dos controles (15 % cada uno), dos pruebas (25 % cada una) y el examen (20 %). Avísenme con anticipación si tienen tope con otra evaluación.',
      fecha: `${sumarDias(p.inicio, 8)} 19:30`,
    },
    {
      titulo: 'Materia de la Prueba 1',
      cuerpo:
        'La Prueba 1 incluye todos los contenidos vistos hasta la clase anterior. El ayudante hará una sesión de ejercicios el viernes en la sala habitual.',
      fecha: `${sumarDias(prueba1, -5)} 17:00`,
      seccion: 1,
    },
    {
      titulo: 'Notas del Control 1 publicadas',
      cuerpo:
        'Ya pueden revisar sus notas del Control 1. Quienes quieran revisar su control pueden pasar por la oficina el jueves de 12:00 a 13:00.',
      fecha: `${sumarDias(control1, 8)} 10:00`,
    },
    {
      titulo: 'Recordatorio: informe final del proyecto',
      cuerpo:
        'Les recuerdo que el informe final del proyecto se entrega en la pestaña Entregas antes del plazo indicado. No se reciben entregas por correo.',
      fecha: `${sumarDias(hoy, -1)} 09:15`,
    },
    {
      titulo: 'Cambio de sala del jueves',
      cuerpo:
        'Este jueves la clase será en el auditorio del edificio central, por una actividad de la facultad en nuestra sala habitual. El horario no cambia.',
      fecha: `${sumarDias(hoy, -2)} 20:00`,
      seccion: 1,
    },
  ]
  // Los dos últimos son del período activo; en uno cerrado quedan fuera.
  return anuncios.filter(
    (a) => a.fecha.slice(0, 10) < hoy && a.fecha.slice(0, 10) <= p.termino,
  )
}

async function sembrarAnuncios(
  m: EntityManager,
  ctx: Contexto,
  curso: { id: string; nombre: string },
  secciones: SeccionDemo[],
  p: PeriodoDemo,
  hoy: string,
) {
  const [{ hay }] = await m.query<{ hay: boolean }[]>(
    'SELECT EXISTS (SELECT 1 FROM anuncio WHERE curso_id = $1) AS hay',
    [curso.id],
  )
  const delCurso = secciones.filter((s) => s.curso === curso.id)
  if (hay || delCurso.length === 0) return
  const recientes = sumarDias(hoy, -7)
  for (const a of anunciosDe(curso.nombre, p, hoy)) {
    const seccion = a.seccion
      ? delCurso.find((s) => s.numero === a.seccion)
      : undefined
    if (a.seccion && !seccion) continue
    const autor = (seccion ?? delCurso[0]).profesor
    const [{ id }] = await m.query<{ id: string }[]>(
      `INSERT INTO anuncio (universidad_id, curso_id, seccion_id, autor_id, titulo, cuerpo, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::timestamp AT TIME ZONE '${ZONA}', $7::timestamp AT TIME ZONE '${ZONA}')
       RETURNING id`,
      [
        ctx.universidad,
        curso.id,
        seccion?.id ?? null,
        autor,
        a.titulo,
        a.cuerpo,
        a.fecha,
      ],
    )
    // La mayoría ya los leyó; los anuncios de la última semana siguen nuevos
    // para el alumno fijo (ANU-04).
    const lectores = (seccion ? [seccion] : delCurso)
      .flatMap((s) => s.alumnos)
      .filter((al) =>
        al.correo === FIJOS.alumno
          ? a.fecha.slice(0, 10) < recientes
          : azar(al.correo, curso.nombre, a.titulo, a.fecha) % 100 < 75,
      )
    await m.query(
      `INSERT INTO lectura_anuncio (alumno_id, anuncio_id, universidad_id, visto_en)
       SELECT unnest($1::uuid[]), $2, $3, $4::timestamp AT TIME ZONE '${ZONA}' + interval '5 hours'`,
      [lectores.map((l) => l.id), id, ctx.universidad, a.fecha],
    )
  }
}

async function sembrarActividades(
  m: EntityManager,
  ctx: Contexto,
  s: SeccionDemo,
  p: PeriodoDemo,
  hoy: string,
) {
  const actividades = [
    {
      titulo: 'Tarea 3: ejercicios de la unidad 4',
      instrucciones:
        'Resuelvan los ejercicios de la guía 4 y súbanlos en un solo PDF, con su nombre en la primera página. Se evalúa el desarrollo, no solo el resultado.',
      plazo: `${sumarDias(hoy, 7)} 23:59`,
    },
    {
      titulo: 'Informe final del proyecto',
      instrucciones:
        'Entreguen el informe final del proyecto en PDF (máximo 15 páginas), con introducción, desarrollo, resultados y conclusiones.',
      plazo: `${sumarDias(p.termino, -7)} 23:59`,
    },
  ].filter(
    (a) => a.plazo.slice(0, 10) > hoy && a.plazo.slice(0, 10) <= p.termino,
  )
  for (const a of actividades) {
    await m.query(
      `INSERT INTO actividad (universidad_id, seccion_id, titulo, instrucciones, plazo, creada_por, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5::timestamp AT TIME ZONE '${ZONA}', $6,
               $7::timestamp AT TIME ZONE '${ZONA}', $7::timestamp AT TIME ZONE '${ZONA}')`,
      [
        ctx.universidad,
        s.id,
        a.titulo,
        a.instrucciones,
        a.plazo,
        s.profesor,
        `${sumarDias(hoy, -10)} 11:00`,
      ],
    )
  }
}

// --- Períodos ---------------------------------------------------------------------

async function crearCursos(
  m: EntityManager,
  ctx: Contexto,
  periodoId: string,
  creado: string | null,
) {
  for (const carrera of ctx.f.carreras) {
    const carreraId = ctx.carreras.get(carrera.nombre)
    if (!carreraId) continue
    for (const curso of carrera.cursos) {
      await m.query(
        `INSERT INTO curso (universidad_id, carrera_id, periodo_id, codigo, nombre, created_at)
         VALUES ($1, $2, $3, $4, $5, coalesce($6::timestamp AT TIME ZONE '${ZONA}', now()))
         ON CONFLICT (codigo, periodo_id) DO NOTHING`,
        [
          ctx.universidad,
          carreraId,
          periodoId,
          curso.codigo,
          curso.nombre,
          creado,
        ],
      )
      await m.query(
        `INSERT INTO seccion (universidad_id, curso_id, numero)
         SELECT $1, c.id, numero FROM curso c CROSS JOIN unnest(ARRAY[1, 2]) AS numero
          WHERE c.periodo_id = $2 AND c.codigo = $3
         ON CONFLICT (curso_id, numero) DO NOTHING`,
        [ctx.universidad, periodoId, curso.codigo],
      )
    }
  }
}

// Puebla las secciones vacías del período (sin profesor, ayudantes, alumnos ni
// horario), como GES-20.
async function poblarSecciones(
  m: EntityManager,
  ctx: Contexto,
  periodoId: string,
  clave: string,
  desde: string,
) {
  for (const [indiceCarrera, carrera] of ctx.f.carreras.entries()) {
    for (const [i, curso] of carrera.cursos.entries()) {
      const indiceCurso = indiceCarrera * 5 + i
      const secciones = await m.query<{ id: string; numero: number }[]>(
        `SELECT s.id, s.numero FROM seccion s JOIN curso c ON c.id = s.curso_id
          WHERE c.periodo_id = $1 AND c.codigo = $2 AND c.universidad_id = $3
            AND s.archived_at IS NULL AND c.archived_at IS NULL
            AND s.profesor_id IS NULL AND s.horario_version = 0
            AND NOT EXISTS (SELECT 1 FROM ayudante_seccion a WHERE a.seccion_id = s.id)
            AND NOT EXISTS (SELECT 1 FROM inscripcion n WHERE n.seccion_id = s.id)
          ORDER BY s.numero`,
        [periodoId, curso.codigo, ctx.universidad],
      )
      for (const s of secciones) {
        const asignacion = conFijos(
          ctx,
          clave,
          curso.codigo,
          s.numero,
          asignacionDe(
            ctx,
            clave,
            indiceCarrera,
            indiceCurso,
            curso.codigo,
            s.numero,
          ),
        )
        await poblarSeccion(
          m,
          ctx,
          s.id,
          bloquesDe(indiceCurso, s.numero, ctx.f.prefijoSala),
          asignacion,
          desde,
        )
      }
    }
  }
}

async function sembrarContenido(
  m: EntityManager,
  ctx: Contexto,
  periodoId: string,
  clave: string,
  p: PeriodoDemo,
  hoy: string,
  cerrado: boolean,
) {
  const secciones = await seccionesDe(m, ctx, periodoId, clave)
  for (const s of secciones) {
    const [{ hay }] = await m.query<{ hay: boolean }[]>(
      `SELECT EXISTS (SELECT 1 FROM evaluacion WHERE seccion_id = $1)
           OR EXISTS (SELECT 1 FROM clase WHERE seccion_id = $1) AS hay`,
      [s.id],
    )
    if (hay) continue
    const fija = s.numero === 1 && ctx.fijos.size > 0 && !cerrado
    const estado: EstadoRevision =
      fija && ESTADO_FIJO[s.codigo]
        ? ESTADO_FIJO[s.codigo]
        : azar(s.codigo, String(s.numero)) % 3 === 1
          ? 'EN_REVISION'
          : 'APROBADA'
    await sembrarRegistroAcademico(m, ctx, s, p, hoy, cerrado, estado)
    if (!cerrado) await sembrarActividades(m, ctx, s, p, hoy)
  }
  const cursos = await m.query<{ id: string; nombre: string }[]>(
    `SELECT DISTINCT c.id, c.nombre FROM curso c JOIN carrera ca ON ca.id = c.carrera_id
      WHERE ca.facultad_id = $1 AND c.periodo_id = $2 AND c.archived_at IS NULL`,
    [ctx.facultad, periodoId],
  )
  for (const curso of cursos) {
    await sembrarAnuncios(m, ctx, curso, secciones, p, hoy)
  }
}

async function sembrarPeriodoCerrado(
  m: EntityManager,
  ctx: Contexto,
  p: PeriodoCerradoDemo,
  hoy: string,
) {
  const clave = clavePeriodo(p)
  const [existente] = await m.query<{ id: string }[]>(
    `SELECT id FROM periodo WHERE universidad_id = $1 AND anio = $2 AND semestre = $3`,
    [ctx.universidad, p.anio, p.semestre],
  )
  const periodoId =
    existente?.id ??
    (
      await m.query<{ id: string }[]>(
        `INSERT INTO periodo (universidad_id, anio, semestre, fecha_inicio, fecha_termino, activo)
         VALUES ($1, $2, $3, $4, $5, false) RETURNING id`,
        [ctx.universidad, p.anio, p.semestre, p.inicio, p.termino],
      )
    )[0].id
  // Un período cerrado se carga una sola vez por facultad: si ya tiene
  // cursos de la facultad, no se toca.
  const [{ hay }] = await m.query<{ hay: boolean }[]>(
    `SELECT EXISTS (SELECT 1 FROM curso c JOIN carrera ca ON ca.id = c.carrera_id
                     WHERE c.periodo_id = $1 AND ca.facultad_id = $2) AS hay`,
    [periodoId, ctx.facultad],
  )
  if (hay) return
  const preparado = sumarDias(p.inicio, -20)
  await crearCursos(m, ctx, periodoId, `${preparado} 10:00`)
  await poblarSecciones(m, ctx, periodoId, clave, sumarDias(p.inicio, -7))
  await sembrarContenido(m, ctx, periodoId, clave, p, hoy, true)

  // Cierre de cada curso (HIS-01), una semana después del término, y archivo
  // de los del período más antiguo (HIS-03).
  await m.query(
    `INSERT INTO cierre_curso (id, universidad_id, responsable_id, fecha)
     SELECT c.id, c.universidad_id, $3, $4::timestamp AT TIME ZONE '${ZONA}'
       FROM curso c JOIN carrera ca ON ca.id = c.carrera_id
      WHERE c.periodo_id = $1 AND ca.facultad_id = $2`,
    [
      periodoId,
      ctx.facultad,
      ctx.administrativo,
      `${sumarDias(p.termino, 7)} 17:00`,
    ],
  )
  if (p.archivar) {
    await m.query(
      `UPDATE curso c SET archived_at = $3::timestamp AT TIME ZONE '${ZONA}'
         FROM carrera ca
        WHERE ca.id = c.carrera_id AND c.periodo_id = $1 AND ca.facultad_id = $2`,
      [periodoId, ctx.facultad, `${sumarDias(p.termino, 60)} 12:00`],
    )
  }
}

async function sembrarPeriodoActivo(
  m: EntityManager,
  ctx: Contexto,
  hoy: string,
) {
  const [activo] = await m.query<
    {
      id: string
      anio: number
      semestre: number
      inicio: string
      termino: string
    }[]
  >(
    `SELECT id, anio, semestre, to_char(fecha_inicio, 'YYYY-MM-DD') AS inicio,
            to_char(fecha_termino, 'YYYY-MM-DD') AS termino
       FROM periodo WHERE universidad_id = $1 AND activo`,
    [ctx.universidad],
  )
  if (!activo) return
  const clave = clavePeriodo(activo)
  const p: PeriodoDemo = { ...activo, receso: RECESO_ACTIVO }
  if (!ctx.f.activoPorGes20) {
    await crearCursos(m, ctx, activo.id, null)
    await poblarSecciones(m, ctx, activo.id, clave, sumarDias(p.inicio, -7))
  } else {
    await asignarFijosEnActivo(m, ctx, activo.id, clave)
  }
  await sembrarContenido(m, ctx, activo.id, clave, p, hoy, false)
}

// En las secciones que completó GES-20, los usuarios fijos se suman a las de
// su trayectoria del período activo.
async function asignarFijosEnActivo(
  m: EntityManager,
  ctx: Contexto,
  periodoId: string,
  clave: string,
) {
  const t = TRAYECTORIA[clave]
  if (!t) return
  const seccion = async (codigo: string) => {
    const [fila] = await m.query<{ id: string }[]>(
      `SELECT s.id FROM seccion s JOIN curso c ON c.id = s.curso_id
        WHERE c.periodo_id = $1 AND c.codigo = $2 AND c.universidad_id = $3
          AND s.numero = 1 AND s.archived_at IS NULL AND c.archived_at IS NULL`,
      [periodoId, codigo, ctx.universidad],
    )
    return fila?.id
  }
  const profesor = ctx.fijos.get(FIJOS.profesor)
  const ayudante = ctx.fijos.get(FIJOS.ayudante)
  const alumno = ctx.fijos.get(FIJOS.alumno)
  const u = ctx.universidad

  for (const codigo of [...t.profesor, ...t.coprofesor]) {
    const id = await seccion(codigo)
    if (!id || !profesor) continue
    const [{ asignado }] = await m.query<{ asignado: boolean }[]>(
      `SELECT EXISTS (SELECT 1 FROM seccion_profesor WHERE seccion_id = $1 AND usuario_id = $2) AS asignado`,
      [id, profesor],
    )
    if (asignado) continue
    await m.query(
      `INSERT INTO seccion_profesor (universidad_id, seccion_id, usuario_id) VALUES ($1, $2, $3)`,
      [u, id, profesor],
    )
    // Único profesor: el que asignó GES-20 deja la sección.
    if (t.profesor.includes(codigo)) {
      await m.query(
        `UPDATE seccion_profesor SET archived_at = clock_timestamp()
          WHERE seccion_id = $1 AND usuario_id <> $2 AND archived_at IS NULL`,
        [id, profesor],
      )
    }
  }
  for (const [codigos, usuario, tabla] of [
    [t.ayudante, ayudante, 'ayudante_seccion'],
    [t.alumno, alumno, 'inscripcion'],
  ] as const) {
    if (!usuario) continue
    for (const codigo of codigos) {
      const id = await seccion(codigo)
      if (!id) continue
      await m.query(
        `INSERT INTO ${tabla} (universidad_id, seccion_id, usuario_id)
         SELECT $1, $2, $3
          WHERE NOT EXISTS (SELECT 1 FROM ${tabla} WHERE seccion_id = $2 AND usuario_id = $3)`,
        [u, id, usuario],
      )
    }
  }
}

// --- Inicios de sesión ------------------------------------------------------------

// Dos semanas de inicios de sesión para el registro de accesos (SEG-05). Solo
// si la universidad todavía no tiene ninguno.
async function sembrarInicios(m: EntityManager, dominio: string, hoy: string) {
  const [universidad] = await m.query<{ id: string }[]>(
    'SELECT id FROM universidad WHERE dominio_correo = $1',
    [dominio],
  )
  if (!universidad) return
  const [{ hay }] = await m.query<{ hay: boolean }[]>(
    `SELECT EXISTS (SELECT 1 FROM evento_auditoria
                     WHERE universidad_id = $1 AND tipo = 'INICIO_SESION') AS hay`,
    [universidad.id],
  )
  if (hay) return
  const usuarios = await m.query<Persona[]>(
    `SELECT id, correo FROM usuario
      WHERE universidad_id = $1 AND archived_at IS NULL ORDER BY correo`,
    [universidad.id],
  )
  const activos = usuarios.filter(
    (u) =>
      !u.correo.split('@')[0].includes('.') ||
      azar(u.correo, 'activo') % 100 < 25,
  )
  const eventos: {
    usuario: string
    resultado: string
    fecha: string
    ip: string
  }[] = []
  for (let d = 14; d >= 1; d--) {
    const dia = sumarDias(hoy, -d)
    if (diaSemana(dia) > 5) continue
    for (const u of activos) {
      const r = azar(u.correo, dia)
      if (r % 100 >= 55) continue
      const hora = 8 + (r % 13)
      const minuto = Math.floor(r / 13) % 60
      const fecha = `${dia} ${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`
      const ip = `200.${(azar(u.correo) % 200) + 10}.${azar(u.correo, 'ip') % 250}.${(r >>> 8) % 250}`
      // De vez en cuando, una contraseña mal escrita antes de entrar.
      if (r % 17 === 0) {
        eventos.push({ usuario: u.id, resultado: 'FALLIDO', fecha, ip })
      }
      eventos.push({ usuario: u.id, resultado: 'EXITOSO', fecha, ip })
    }
  }
  if (eventos.length === 0) return
  await m.query(
    `INSERT INTO evento_auditoria (tipo, resultado, usuario_id, universidad_id, fecha, ip)
     SELECT 'INICIO_SESION', r, u, $1, f::timestamp AT TIME ZONE '${ZONA}', ip::inet
       FROM unnest($2::uuid[], $3::text[], $4::text[], $5::text[]) AS x(u, r, f, ip)`,
    [
      universidad.id,
      eventos.map((e) => e.usuario),
      eventos.map((e) => e.resultado),
      eventos.map((e) => e.fecha),
      eventos.map((e) => e.ip),
    ],
  )
}

// --- Entrada ----------------------------------------------------------------------

// Correos de las personas extra de Ingeniería de Norte, para que GES-20 las
// reparta junto con las de GES-22 en el período activo.
export function correosExtraDeIngenieria(): string[] {
  return usuariosExtraDeDemo(DOMINIO_DEMO)
    .filter((u) => u.facultad === FACULTAD_DEMO)
    .map((u) => `${u.usuario}@${DOMINIO_DEMO}`)
}

// Recibe el manager de la transacción del seed: una falla revierte todo.
// `hoy` (YYYY-MM-DD) decide qué evaluaciones ya se rindieron y hasta dónde
// llegan las clases del período activo.
export async function sembrarDemo(m: EntityManager, hoy: string) {
  for (const f of FACULTADES_DEMO) {
    const ctx = await cargarContexto(m, f)
    if (!ctx) continue
    for (const p of f.periodosCerrados) {
      await sembrarPeriodoCerrado(m, ctx, p, hoy)
    }
    await sembrarPeriodoActivo(m, ctx, hoy)
  }
  for (const dominio of new Set(FACULTADES_DEMO.map((f) => f.dominio))) {
    await sembrarInicios(m, dominio, hoy)
  }
}

export interface ResumenDemo {
  periodosCerrados: number
  secciones: number
  evaluaciones: number
  notas: number
  clases: number
  anuncios: number
}

export async function resumenDemo(
  m: Pick<EntityManager, 'query'>,
): Promise<ResumenDemo> {
  const [resumen] = await m.query<ResumenDemo[]>(
    `SELECT (SELECT count(*)::int FROM periodo WHERE NOT activo) AS "periodosCerrados",
            (SELECT count(*)::int FROM seccion) AS secciones,
            (SELECT count(*)::int FROM evaluacion) AS evaluaciones,
            (SELECT count(*)::int FROM nota) AS notas,
            (SELECT count(*)::int FROM clase) AS clases,
            (SELECT count(*)::int FROM anuncio) AS anuncios`,
  )
  return resumen
}
