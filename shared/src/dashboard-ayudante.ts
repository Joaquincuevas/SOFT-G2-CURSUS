// ESP-02: tarjeta del dashboard del ayudante, una por cada sección donde es
// ayudante en el período activo (GET /api/dashboard/secciones-ayudante).
export interface SeccionAyudante {
  id: string
  numero: number
  curso: { id: string; codigo: string; nombre: string }
  // Profesor a cargo; null si la sección no tiene.
  profesor: { id: string; nombre: string } | null
}
