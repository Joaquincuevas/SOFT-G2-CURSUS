// GES-25: nombres de los profesores vigentes de la sección `s` (asignación
// activa y cuenta de profesor vigente), por nombre, como los ayudantes. El
// campo profesor anterior se mantiene, deprecado, mientras dure la
// transición.
export const NOMBRES_PROFESORES = (seccion = 's') => `
  COALESCE((SELECT json_agg(u.nombre ORDER BY u.nombre, u.correo, u.id)
              FROM seccion_profesor sp
              JOIN usuario u ON u.id = sp.usuario_id
                            AND u.universidad_id = sp.universidad_id
             WHERE sp.seccion_id = ${seccion}.id AND sp.archived_at IS NULL
               AND u.archived_at IS NULL AND u.rol = 'PROFESOR'), '[]')`
