import type { BloqueHorario } from './horarios.js'

// ESP-01: tarjeta del dashboard del profesor, una por cada sección a su cargo
// en el período activo (GET /api/dashboard/mis-secciones).
export interface SeccionDashboard {
  id: string
  numero: number
  curso: { id: string; codigo: string; nombre: string }
  // Bloques activos, ordenados por día y hora de inicio.
  horario: BloqueHorario[]
  // Alumnos con inscripción activa.
  alumnos: number
  // NOT-10: evaluaciones de la sección en revisión.
  pendientesRevision: number
}

// NOT-10: evaluación enviada a revisión en una sección a cargo del profesor
// (GET /api/dashboard/pendientes-revision), con el último envío.
export interface PendienteRevision {
  evaluacion: { id: string; nombre: string; fecha: string }
  seccion: { id: string; numero: number }
  curso: { id: string; codigo: string; nombre: string }
  // Quién hizo el último envío y cuándo (ISO 8601): tras una devolución
  // (NOT-12), el reenvío. Null solo si la fila se cambió fuera de la API, sin
  // evento ENVIO.
  ayudante: { id: string; nombre: string } | null
  enviadaEl: string | null
  // Alumnos activos sin nota: los inscritos después del envío (NOT-08).
  sinNota: number
}

// ESP-03: una tarjeta por inscripción activa del alumno en el período activo.
export interface SeccionAlumno extends Omit<
  SeccionDashboard,
  'alumnos' | 'pendientesRevision'
> {
  // GES-25: el primer profesor vigente. Deprecado: usa profesores. Se
  // retira con seccion.profesor_id (docs/ges-25-varios-profesores.md).
  profesor: { id: string; nombre: string } | null
  // GES-25: todos los profesores vigentes, por nombre.
  profesores: string[]
  anunciosNuevos: number
}
