import type { SeccionEspacio } from './espacio.js'
import type { BloqueHorario } from './horarios.js'

// ESP-04 (RE-04): vista general de una sección para sus integrantes
// (GET /api/espacio/secciones/:id/resumen).
export interface SeccionResumen extends SeccionEspacio {
  // Bloques activos, por día y hora, cada uno con su sala.
  horario: BloqueHorario[]
  // Profesor a cargo; null si la sección no tiene.
  profesor: { id: string; nombre: string } | null
  // Ayudantes con asignación activa, por nombre.
  ayudantes: { id: string; nombre: string }[]
}
