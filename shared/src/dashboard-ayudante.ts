// ESP-02: tarjeta del dashboard del ayudante, una por cada sección donde es
// ayudante en el período activo (GET /api/dashboard/secciones-ayudante).
export interface SeccionAyudante {
  id: string
  numero: number
  curso: { id: string; codigo: string; nombre: string }
  // GES-25: el primer profesor vigente. Deprecado: usa profesores. Se
  // retira con seccion.profesor_id (docs/ges-25-varios-profesores.md).
  profesor: { id: string; nombre: string } | null
  // GES-25: todos los profesores vigentes, por nombre.
  profesores: string[]
}
