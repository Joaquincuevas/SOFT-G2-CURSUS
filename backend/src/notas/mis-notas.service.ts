import type {
  MisNotasSeccion,
  NotaPropia,
  SeccionEspacio,
} from '@cursus/shared'
import { ForbiddenException, Injectable } from '@nestjs/common'
import {
  BaseDeDatos,
  type ContextoUniversidad,
  fijarUsuario,
} from '../database/base-de-datos.service.js'
import { calcularNotaFinal } from './nota-final.js'

// NOT-13 (RE-02): evaluaciones activas de la sección, por fecha como la lista
// de evaluaciones, con la nota publicada del alumno o null. El filtro de la
// nota repite la RLS (pol_nota_lectura_alumno), que es la que lo garantiza.
// NOT-14 calcula la nota final con estas mismas filas, y notas-finales
// (profesor) repite el mismo filtro de nota publicada.
const MIS_NOTAS = `
  SELECT e.id AS "evaluacionId", e.nombre,
         to_char(e.fecha, 'YYYY-MM-DD') AS fecha, e.ponderacion,
         n.valor::float8 AS nota,
         n.recorreccion_id IS NOT NULL AS recorregida
    FROM evaluacion e
    LEFT JOIN nota n ON n.evaluacion_id = e.id
                    AND n.universidad_id = e.universidad_id
                    AND n.alumno_id = $3
                    AND n.estado = 'PUBLICADA'
                    AND n.archived_at IS NULL
   WHERE e.universidad_id = $1 AND e.seccion_id = $2 AND e.archived_at IS NULL
   ORDER BY e.fecha, e.nombre, e.id`

@Injectable()
export class MisNotasService {
  constructor(private readonly bd: BaseDeDatos) {}

  // Solo el alumno inscrito en la sección: el profesor, el ayudante y los
  // demás roles leen las notas por evaluación (NotasController).
  async obtener(
    contexto: ContextoUniversidad,
    alumnoId: string,
    seccion: SeccionEspacio,
  ): Promise<MisNotasSeccion> {
    if (contexto.rol !== 'ALUMNO' || seccion.rol !== 'ALUMNO') {
      throw new ForbiddenException()
    }
    const evaluaciones = await this.bd.enTransaccionEnUniversidad(
      contexto,
      async (bd) => {
        await fijarUsuario(bd, alumnoId)
        return bd.query<NotaPropia>(MIS_NOTAS, [
          contexto.universidadId,
          seccion.id,
          alumnoId,
        ])
      },
    )
    return { evaluaciones, notaFinal: calcularNotaFinal(evaluaciones) }
  }
}
