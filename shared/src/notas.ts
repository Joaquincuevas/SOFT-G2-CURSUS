import type { PeriodoResumen } from './cursos.js'

// NOT-01 (RN-10): evaluaciones de una sección
// (/api/espacio/secciones/:id/evaluaciones). Cada evaluación es de una
// sección, no del curso: el profesor y el acceso son por sección.

export const LARGO_NOMBRE_EVALUACION = 100
// Ponderación en porcentaje entero.
export const PONDERACION_MINIMA = 1
export const PONDERACION_MAXIMA = 100

// RN-10/NOT-02: se pueden preparar evaluaciones con un total distinto de
// 100; ese total impide publicar la nota final, no crear evaluaciones.
export const SUMA_PONDERACIONES_REQUERIDA = 100

export function avisoPonderaciones(suma: number): string | null {
  const diferencia = SUMA_PONDERACIONES_REQUERIDA - suma
  if (diferencia === 0) return null
  const cantidad = Math.abs(diferencia)
  const verbo =
    diferencia > 0
      ? cantidad === 1
        ? 'Falta'
        : 'Faltan'
      : cantidad === 1
        ? 'Sobra'
        : 'Sobran'
  return `Las ponderaciones suman ${suma} %. ${verbo} ${cantidad} ${cantidad === 1 ? 'punto porcentual' : 'puntos porcentuales'} para completar ${SUMA_PONDERACIONES_REQUERIDA} %.`
}

export interface Evaluacion {
  id: string
  nombre: string
  // YYYY-MM-DD, dentro del período del curso.
  fecha: string
  ponderacion: number
  // Solo en el listado del profesor. La escritura vuelve a verificarlo.
  tieneNotas?: boolean
  // NOT-09: solo en el listado del ayudante de la sección. Los demás roles
  // no reciben el estado ni el comentario por el listado de evaluaciones.
  envio?: EstadoEnvioNotas
}

export const EVALUACION_CON_NOTAS =
  'Esta evaluación ya tiene notas ingresadas y no se puede editar.'

// GET: evaluaciones activas por fecha, con la suma de sus ponderaciones (el
// aviso de que no suman 100 % es NOT-02).
export interface EvaluacionesSeccion {
  evaluaciones: Evaluacion[]
  sumaPonderaciones: number
}

// Body de POST.
export interface CrearEvaluacion {
  nombre: string
  fecha: string
  ponderacion: number
}

// NOT-04 (RN-12): tipos de evento de la auditoría de notas (tabla
// nota_cambio). PROPUESTA, PUBLICACION (NOT-11) y RECORRECCION son de la nota
// de un alumno; ENVIO, APROBACION y DEVOLUCION, de toda la evaluación.
export const TIPOS_EVENTO_NOTA = [
  'PROPUESTA',
  'ENVIO',
  'APROBACION',
  'DEVOLUCION',
  'RECORRECCION',
  'PUBLICACION',
] as const

export type TipoEventoNota = (typeof TIPOS_EVENTO_NOTA)[number]

// NOT-16: eventos de un alumno y de su evaluación, ordenados por fecha e id.
export interface EventoHistorialNota {
  id: string
  tipo: TipoEventoNota
  fecha: string
  responsable: { id: string; nombre: string }
  notaAnterior: number | null
  notaNueva: number | null
  motivo: string | null
}

export interface HistorialNota {
  eventos: EventoHistorialNota[]
}

// Motivo de una devolución o una recorrección (NOT-12 y NOT-15).
export const LARGO_MOTIVO_NOTA = 500

// NOT-12: cuerpo de POST .../notas/devolucion. El comentario para el ayudante
// es obligatorio; queda en revision_notas y como motivo del evento
// DEVOLUCION, con el mismo largo.
export interface DevolverNotas {
  comentario: string
}
export const LARGO_COMENTARIO_DEVOLUCION = LARGO_MOTIVO_NOTA

// Notas de 1,0 a 7,0 con un decimal (NOT-06).
export const NOTA_MINIMA = 1
export const NOTA_MAXIMA = 7

// NOT-05 (RN-10): notas de una evaluación
// (/api/espacio/secciones/:id/evaluaciones/:evaluacionId/notas). El ayudante
// las ingresa como propuesta; publicarlas es NOT-11.
export const ESTADOS_NOTA = ['PROPUESTA', 'PUBLICADA'] as const

export type EstadoNota = (typeof ESTADOS_NOTA)[number]

// Tope de notas por guardado: más que los alumnos de cualquier sección.
export const MAX_NOTAS_GUARDADO = 500

// NOT-06: por qué una nota no es válida. `formato`: no es un número o tiene
// más de un decimal (5,55, "x", vacío); `rango`: es un número con a lo más un
// decimal, pero fuera de 1,0 a 7,0 (0,9, 7,1, 8).
export type MotivoNotaInvalida = 'formato' | 'rango'

export const MENSAJES_NOTA_INVALIDA: Record<MotivoNotaInvalida, string> = {
  formato: 'Formato inválido: escribe un número con un decimal, como 5,5',
  rango: 'Fuera de rango: la nota va de 1,0 a 7,0',
}

// Motivo por el que el valor no es una nota de 1,0 a 7,0 con a lo más un
// decimal, o null si lo es. Primero el formato y después el rango.
export function motivoNotaInvalida(valor: unknown): MotivoNotaInvalida | null {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return 'formato'
  const decimas = Math.round(valor * 10)
  // Exacto, sin tolerancia: decimas / 10 da el mismo número que leer "5,5"
  // o "5.5", así que toda nota con un decimal pasa. Una tolerancia aceptaría
  // 0,99999999999 o 7,00000000001, que numeric(2,1) guardaría como 1,0 y 7,0.
  if (decimas / 10 !== valor) return 'formato'
  return decimas < NOTA_MINIMA * 10 || decimas > NOTA_MAXIMA * 10
    ? 'rango'
    : null
}

// true si es un número de 1,0 a 7,0 con a lo más un decimal. Lo exigen el
// DTO del PUT (NOT-06), el servicio y la auditoría (NOT-04).
export function esNotaValida(valor: unknown): valor is number {
  return motivoNotaInvalida(valor) === null
}

// NOT-07: estado de las notas de una evaluación frente al profesor. El
// ayudante guarda un BORRADOR, que el profesor no ve como pendiente; enviar a
// revisión (NOT-08), aprobar (NOT-11) y devolver (NOT-12) son otras tarjetas.
export const ESTADOS_REVISION_NOTAS = [
  'BORRADOR',
  'EN_REVISION',
  'APROBADA',
  'DEVUELTA',
] as const

export type EstadoRevisionNotas = (typeof ESTADOS_REVISION_NOTAS)[number]

// Estado compartido por los ayudantes activos de la sección, sin notas ni
// identidades de los alumnos. Sin un envío previo, el estado es BORRADOR.
export interface EstadoEnvioNotas {
  estado: EstadoRevisionNotas
  // Solo mientras está DEVUELTA; al reenviar, el comentario actual se limpia.
  comentarioDevolucion: string | null
}

// Un alumno activo de la sección con su nota en la evaluación, o null si aún
// no tiene.
export interface NotaAlumno {
  id: string
  nombre: string
  nota: number | null
  estado: EstadoNota | null
  // NOT-15: la nota publicada tiene una recorrección en la auditoría.
  recorregida?: boolean
}

// La nota que vio el profesor evita sobrescribir otra recorrección realizada
// desde una segunda pestaña. El servidor conserva la anterior real.
export interface RecorregirNota {
  notaAnterior: number
  notaNueva: number
  motivo: string
}

export interface ErrorNotaRecorregida {
  statusCode: 409
  message: string
  notaActual: number
}

// GET y respuesta del PUT: los alumnos activos de la sección por nombre.
export interface NotasEvaluacion {
  cursoCerrado?: boolean
  evaluacion: Evaluacion
  // BORRADOR también si el ayudante aún no guarda nada.
  estado: EstadoRevisionNotas
  // NOT-09: opcional para compatibilidad con respuestas anteriores. La API
  // actual siempre lo devuelve, a null salvo que el estado sea DEVUELTA.
  comentarioDevolucion?: string | null
  alumnos: NotaAlumno[]
}

// Body del PUT: las notas a guardar, de cualquier subconjunto de los alumnos
// activos. Un alumno que no viene conserva la nota que tenía.
export interface GuardarNotas {
  notas: { alumnoId: string; nota: number }[]
}

// NOT-06: 400 del PUT cuando alguna nota no es válida. Trae cada alumno con
// su motivo (MENSAJES_NOTA_INVALIDA), en el orden de la lista; no se guarda
// ninguna nota.
export interface ErrorNotasInvalidas {
  statusCode: 400
  message: 'Nota inválida'
  invalidas: { alumnoId: string; motivo: string }[]
}

// NOT-11 y NOT-12: 409 de la aprobación o la devolución cuando la evaluación
// ya no está en revisión, con su estado actual: el cliente la saca de
// pendientes. Los otros 409 de la aprobación (notas que no están propuestas,
// sin notas) no traen estado: la evaluación sigue en revisión.
export interface ErrorEstadoRevision {
  statusCode: 409
  message: string
  estado: Exclude<EstadoRevisionNotas, 'EN_REVISION'>
}

// NOT-08: 400 del envío a revisión cuando algún alumno con inscripción
// activa no tiene nota válida (sus ids). No cambia nada.
export interface ErrorNotasFaltantes {
  statusCode: 400
  message: 'Faltan notas'
  faltantes: string[]
}

// 400 del PUT cuando la lista trae alumnos que no están inscritos en la
// sección o repetidos (ids).
export interface ErrorListaNotas {
  statusCode: 400
  message: string
  sobrantes: string[]
  repetidos: string[]
}

// NOT-13 (RE-02): las notas propias del alumno en una sección
// (/api/espacio/secciones/:id/mis-notas). Cada evaluación activa de la
// sección, por fecha, con la nota del alumno solo si está publicada: null si
// aún no hay nota o está propuesta (en borrador, en revisión o devuelta).
export interface NotaPropia {
  evaluacionId: string
  nombre: string
  // YYYY-MM-DD.
  fecha: string
  ponderacion: number
  nota: number | null
  // NOT-15: solo la marca de recorrección; la auditoría es del profesor.
  recorregida: boolean
}

export interface MisNotasSeccion {
  evaluaciones: NotaPropia[]
  // NOT-14: el mismo cálculo que ve el profesor en notas-finales.
  notaFinal: NotaFinal
}

// NOT-14 (RE-02): nota final de un alumno en una sección, calculada en el
// backend con sus notas publicadas. FINAL cuando todas las evaluaciones
// activas tienen nota publicada y las ponderaciones suman 100; si no, es una
// nota PARCIAL sobre el porcentaje ya evaluado.
export type TipoNotaFinal = 'FINAL' | 'PARCIAL'

export interface NotaFinal {
  tipo: TipoNotaFinal
  // Promedio ponderado de las notas publicadas, con un decimal; null si aún
  // no hay ninguna.
  nota: number | null
  // Suma de las ponderaciones de las evaluaciones con nota publicada.
  porcentajeEvaluado: number
}

// GET /api/espacio/secciones/:id/notas-finales: el profesor de la sección ve
// la nota final de cada alumno activo, por nombre.
export interface NotaFinalAlumno {
  id: string
  nombre: string
  notaFinal: NotaFinal
}

export interface NotasFinalesSeccion {
  alumnos: NotaFinalAlumno[]
}

export interface CursoHistorialAlumno {
  seccionId: string
  seccion: number
  curso: { id: string; codigo: string; nombre: string }
  notaFinal: NotaFinal
}

export interface PeriodoHistorialAlumno {
  periodo: PeriodoResumen
  cursos: CursoHistorialAlumno[]
}

export interface DetalleHistorialAlumno
  extends CursoHistorialAlumno, MisNotasSeccion {
  periodo: PeriodoResumen
}
