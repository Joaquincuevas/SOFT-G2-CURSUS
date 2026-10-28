// Fragmentos internos: los argumentos son expresiones SQL del código, nunca
// parámetros del cliente. Lista, contador y registro comparten destinatario.
export const anunciosVisibles = (curso: string, seccion: string) => `
  a.universidad_id = $1 AND a.curso_id = ${curso}
  AND a.archived_at IS NULL
  AND (a.seccion_id IS NULL OR a.seccion_id = ${seccion})`

export const anuncioPendiente = (alumno: string) => `NOT EXISTS (
  SELECT 1 FROM lectura_anuncio l
   WHERE l.universidad_id = a.universidad_id
     AND l.anuncio_id = a.id AND l.alumno_id = ${alumno})`
