// NOT-10: fragmentos que comparten el contador del dashboard (mis-secciones)
// y la lista de pendientes, para que nunca difieran.

// Secciones vigentes a cargo del profesor ($2) en el período activo de su
// universidad ($1), como `s`. Una evaluación de un período que ya cerró deja
// de estar pendiente aquí. GES-25: con varios profesores por sección, cuenta
// cualquier profesor vigente (es_profesor_de_seccion).
export const SECCIONES_DEL_PROFESOR = `
  SELECT s.id, s.numero, c.id AS curso_id, c.codigo, c.nombre AS curso_nombre
    FROM seccion s
    JOIN curso c ON c.id = s.curso_id
    JOIN periodo p ON p.id = c.periodo_id
   WHERE s.universidad_id = $1 AND es_profesor_de_seccion(s.id, $2) AND p.activo
     AND s.archived_at IS NULL AND c.archived_at IS NULL`

// Evaluaciones vigentes de la sección `s` enviadas a revisión (NOT-08), como
// `e`.
export const EN_REVISION_DE_SECCION = `
    FROM evaluacion e
    JOIN revision_notas r ON r.evaluacion_id = e.id
   WHERE e.seccion_id = s.id AND e.archived_at IS NULL
     AND r.estado = 'EN_REVISION'`
