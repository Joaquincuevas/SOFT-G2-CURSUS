import type { SeccionEspacio } from './espacio.js'
import type { BloqueHorario } from './horarios.js'

// ESP-04 (RE-04): vista general de una sección para sus integrantes
// (GET /api/espacio/secciones/:id/resumen).
export interface SeccionResumen extends SeccionEspacio {
  // Bloques activos, por día y hora, cada uno con su sala.
  horario: BloqueHorario[]
  // GES-25: el primer profesor vigente. Deprecado: usa profesores. Se
  // retira con seccion.profesor_id (docs/ges-25-varios-profesores.md).
  profesor: { id: string; nombre: string } | null
  // GES-25: todos los profesores vigentes, por nombre.
  profesores: string[]
  // Ayudantes con asignación activa, por nombre.
  ayudantes: { id: string; nombre: string }[]
}
