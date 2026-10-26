// Columna `alumnos` (JSON) con los alumnos de inscripción activa en la
// sección. Requiere que la sección se llame s en la consulta, como en
// horarios.sql.ts. La usan la lista de gestión (GES-18) y la del espacio de
// la sección (ESP-05). Orden alfabético en español (la collation ICU ordena
// bien tildes y ñ) y después por correo.
export const ALUMNOS_SECCION = `
  COALESCE((SELECT json_agg(json_build_object(
                     'id', u.id, 'nombre', u.nombre, 'correo', u.correo)
                   ORDER BY u.nombre COLLATE "es-CL-x-icu", u.correo)
              FROM inscripcion i JOIN usuario u ON u.id = i.usuario_id
             WHERE i.seccion_id = s.id AND i.archived_at IS NULL), '[]') AS alumnos`
