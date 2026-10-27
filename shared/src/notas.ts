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
