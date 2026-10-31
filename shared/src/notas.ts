// NOT-01 (RN-10): evaluaciones de una sección
// (/api/espacio/secciones/:id/evaluaciones). Cada evaluación es de una
// sección, no del curso: el profesor y el acceso son por sección.

export const LARGO_NOMBRE_EVALUACION = 100
// Ponderación en porcentaje entero.
export const PONDERACION_MINIMA = 1
export const PONDERACION_MAXIMA = 100

export interface Evaluacion {
  id: string
  nombre: string
  // YYYY-MM-DD, dentro del período del curso.
  fecha: string
  ponderacion: number
}

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
// nota_cambio). PROPUESTA y RECORRECCION son de la nota de un alumno; ENVIO,
// APROBACION y DEVOLUCION, de toda la evaluación.
export const TIPOS_EVENTO_NOTA = [
  'PROPUESTA',
  'ENVIO',
  'APROBACION',
  'DEVOLUCION',
  'RECORRECCION',
] as const

export type TipoEventoNota = (typeof TIPOS_EVENTO_NOTA)[number]

// Motivo de una devolución o una recorrección (NOT-12 y NOT-15).
export const LARGO_MOTIVO_NOTA = 500

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
  if (Math.abs(valor * 10 - decimas) > 1e-9) return 'formato'
  return decimas < NOTA_MINIMA * 10 || decimas > NOTA_MAXIMA * 10
    ? 'rango'
    : null
}

// true si es un número de 1,0 a 7,0 con a lo más un decimal. Lo exigen el
// DTO del PUT (NOT-06), el servicio y la auditoría (NOT-04).
export function esNotaValida(valor: unknown): valor is number {
  return motivoNotaInvalida(valor) === null
}

// Un alumno activo de la sección con su nota en la evaluación, o null si aún
// no tiene.
export interface NotaAlumno {
  id: string
  nombre: string
  nota: number | null
  estado: EstadoNota | null
}

// GET y respuesta del PUT: los alumnos activos de la sección por nombre.
export interface NotasEvaluacion {
  evaluacion: Evaluacion
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

// 400 del PUT cuando la lista trae alumnos que no están inscritos en la
// sección o repetidos (ids).
export interface ErrorListaNotas {
  statusCode: 400
  message: string
  sobrantes: string[]
  repetidos: string[]
}
