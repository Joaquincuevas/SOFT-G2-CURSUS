// La sección se llama s en las consultas del horario y del detalle del curso.
export const BLOQUES_HORARIO = `COALESCE((
  SELECT json_agg(json_build_object(
    'dia', h.dia, 'inicio', to_char(h.inicio, 'HH24:MI'),
    'termino', to_char(h.termino, 'HH24:MI'), 'sala', h.sala)
    ORDER BY h.dia, h.inicio)
  FROM horario_seccion h WHERE h.seccion_id = s.id AND h.archived_at IS NULL
), '[]')`
