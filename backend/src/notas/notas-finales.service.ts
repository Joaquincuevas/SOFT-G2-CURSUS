import type {
  NotaFinalAlumno,
  NotasFinalesSeccion,
  SeccionEspacio,
} from '@cursus/shared'
import { ForbiddenException, Injectable } from '@nestjs/common'
import {
  BaseDeDatos,
  type ContextoUniversidad,
} from '../database/base-de-datos.service.js'
import { calcularNotaFinal, type NotaPonderada } from './nota-final.js'

// NOT-14 (RE-02): alumnos activos de la sección, por nombre como la lista de
// notas de una evaluación, con cada evaluación activa y su nota publicada o
// null: el mismo filtro de nota que mis-notas (MisNotasService).
const ALUMNOS_CON_NOTAS_PUBLICADAS = `
  SELECT u.id, u.nombre,
         COALESCE((SELECT json_agg(json_build_object(
                            'ponderacion', e.ponderacion,
                            'nota', n.valor::float8))
                     FROM evaluacion e
                     LEFT JOIN nota n ON n.evaluacion_id = e.id
                                     AND n.universidad_id = e.universidad_id
                                     AND n.alumno_id = u.id
                                     AND n.estado = 'PUBLICADA'
                                     AND n.archived_at IS NULL
                    WHERE e.universidad_id = $1 AND e.seccion_id = $2
                      AND e.archived_at IS NULL), '[]') AS evaluaciones
    FROM inscripcion i
    JOIN usuario u ON u.id = i.usuario_id AND u.universidad_id = i.universidad_id
   WHERE i.universidad_id = $1 AND i.seccion_id = $2 AND i.archived_at IS NULL
   ORDER BY u.nombre COLLATE "es-CL-x-icu", u.correo`

@Injectable()
export class NotasFinalesService {
  constructor(private readonly bd: BaseDeDatos) {}

  // Solo el profesor de la sección: el alumno ve la suya en mis-notas.
  async obtener(
    contexto: ContextoUniversidad,
    seccion: SeccionEspacio,
  ): Promise<NotasFinalesSeccion> {
    if (contexto.rol !== 'PROFESOR' || seccion.rol !== 'PROFESOR') {
      throw new ForbiddenException(
        'Solo el profesor de la sección ve las notas finales',
      )
    }
    const filas = await this.bd.consultarEnUniversidad<
      Omit<NotaFinalAlumno, 'notaFinal'> & { evaluaciones: NotaPonderada[] }
    >(contexto, ALUMNOS_CON_NOTAS_PUBLICADAS, [seccion.id])
    return {
      alumnos: filas.map(({ id, nombre, evaluaciones }) => ({
        id,
        nombre,
        notaFinal: calcularNotaFinal(evaluaciones),
      })),
    }
  }
}
