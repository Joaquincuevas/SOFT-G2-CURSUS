import type { ResumenAsistenciaSeccion, SeccionEspacio } from '@cursus/shared'
import { ForbiddenException, Injectable } from '@nestjs/common'
import {
  BaseDeDatos,
  type ContextoUniversidad,
} from '../database/base-de-datos.service.js'

@Injectable()
export class ResumenAsistenciaService {
  constructor(private readonly bd: BaseDeDatos) {}

  async obtener(
    contexto: ContextoUniversidad,
    profesorId: string,
    seccion: SeccionEspacio,
  ): Promise<ResumenAsistenciaSeccion> {
    if (contexto.rol !== 'PROFESOR' || seccion.rol !== 'PROFESOR')
      throw new ForbiddenException()
    // Una sola sentencia: denominador y numeradores comparten snapshot.
    // EXISTS evita multiplicar alumnos/clases por inscripciones o marcas.
    const [resumen] =
      await this.bd.consultarEnUniversidad<ResumenAsistenciaSeccion>(
        contexto,
        `
      WITH vigente AS (
        SELECT s.id, s.universidad_id FROM seccion s
        JOIN curso cu ON cu.id = s.curso_id AND cu.universidad_id = s.universidad_id
        JOIN usuario pr ON pr.id = s.profesor_id AND pr.universidad_id = s.universidad_id
        WHERE s.universidad_id = $1 AND s.id = $2 AND s.profesor_id = $3
          AND s.archived_at IS NULL AND cu.archived_at IS NULL
          AND pr.archived_at IS NULL AND pr.rol = 'PROFESOR'
      ), registradas AS (
        SELECT c.id, c.universidad_id FROM clase c
        JOIN vigente s ON s.id = c.seccion_id AND s.universidad_id = c.universidad_id
        WHERE c.archived_at IS NULL AND EXISTS (
          SELECT 1 FROM asistencia a WHERE a.clase_id = c.id
            AND a.universidad_id = c.universidad_id AND a.archived_at IS NULL
        )
      ), total AS (
        SELECT count(*)::int AS n FROM registradas
      ), marcas AS (
        SELECT a.alumno_id, count(*) FILTER (WHERE a.presente)::int AS asistidas,
               count(*)::int AS marcadas
        FROM asistencia a JOIN registradas c ON c.id = a.clase_id AND c.universidad_id = a.universidad_id
        WHERE a.archived_at IS NULL GROUP BY a.alumno_id
      )
      SELECT t.n AS "clasesRegistradas", COALESCE((
        SELECT json_agg(json_build_object(
          'id', u.id, 'nombre', u.nombre,
          'asistidas', COALESCE(m.asistidas, 0),
          'sinMarca', t.n - COALESCE(m.marcadas, 0),
          'porcentaje', round(COALESCE(m.asistidas, 0)::numeric * 100 / NULLIF(t.n, 0), 2)
        ) ORDER BY u.nombre COLLATE "es-CL-x-icu", u.id)
        FROM usuario u LEFT JOIN marcas m ON m.alumno_id = u.id
        WHERE u.universidad_id = s.universidad_id AND u.archived_at IS NULL AND u.rol = 'ALUMNO'
          AND EXISTS (SELECT 1 FROM inscripcion i WHERE i.universidad_id = s.universidad_id
            AND i.seccion_id = s.id AND i.usuario_id = u.id AND i.archived_at IS NULL)
      ), '[]'::json) AS alumnos
      FROM vigente s CROSS JOIN total t
    `,
        [seccion.id, profesorId],
      )
    if (!resumen)
      throw new ForbiddenException(
        'Solo el profesor vigente de la sección puede consultar sus porcentajes',
      )
    return resumen
  }
}
