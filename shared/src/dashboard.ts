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
}
