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

// Notas de 1,0 a 7,0 con un decimal (NOT-06).
export const NOTA_MINIMA = 1
export const NOTA_MAXIMA = 7
