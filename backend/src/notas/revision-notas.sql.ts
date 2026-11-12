// Expresiones de lectura de revision_notas (alias r). El estado y el
// comentario del listado y del detalle corresponden a la misma revisión.
export const ESTADO_REVISION_NOTAS = "COALESCE(r.estado, 'BORRADOR')"
export const COMENTARIO_DEVOLUCION_NOTAS =
  "CASE WHEN r.estado = 'DEVUELTA' THEN r.comentario_devolucion ELSE NULL END"
