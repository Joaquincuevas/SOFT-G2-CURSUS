// El id permite refrescar únicamente el resumen de la sección afectada,
// incluso si el profesor cambió de pestaña antes de terminar el guardado.
export const EVENTO_ASISTENCIA_GUARDADA = 'cursus:asistencia-guardada'

export function avisarAsistenciaGuardada(seccionId: string) {
  window.dispatchEvent(
    new CustomEvent(EVENTO_ASISTENCIA_GUARDADA, { detail: seccionId }),
  )
}
