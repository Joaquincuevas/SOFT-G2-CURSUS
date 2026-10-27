import type {
  Evaluacion,
  EvaluacionesSeccion,
  SeccionEspacio,
} from '@cursus/shared'
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  BaseDeDatos,
  type ContextoUniversidad,
} from '../database/base-de-datos.service.js'
import type { CrearEvaluacionDto } from './crear-evaluacion.dto.js'

// La base devuelve las fechas como YYYY-MM-DD, sin conversión de zona horaria.
const COLUMNAS = `e.id, e.nombre, to_char(e.fecha, 'YYYY-MM-DD') AS fecha,
  e.ponderacion`

// NOT-01 (RN-10): evaluaciones de una sección que IntegranteSeccionGuard ya
// verificó. El controlador decide quién lee y quién crea.
@Injectable()
export class EvaluacionesService {
  constructor(private readonly bd: BaseDeDatos) {}

  // Activas, por fecha, con la suma de sus ponderaciones. El Director las lee
  // en cualquier universidad, en una transacción READ ONLY.
  async listar(
    contexto: ContextoUniversidad,
    seccion: SeccionEspacio,
  ): Promise<EvaluacionesSeccion> {
    const orden = 'ORDER BY e.fecha, e.nombre, e.id'
    const evaluaciones =
      contexto.rol === 'DIRECTOR'
        ? await this.bd.consultarEnTodasLasUniversidades<Evaluacion>(
            contexto,
            `SELECT ${COLUMNAS} FROM evaluacion e
              WHERE e.seccion_id = $1 AND e.archived_at IS NULL ${orden}`,
            [seccion.id],
          )
        : await this.bd.consultarEnUniversidad<Evaluacion>(
            contexto,
            `SELECT ${COLUMNAS} FROM evaluacion e
              WHERE e.universidad_id = $1 AND e.seccion_id = $2
                AND e.archived_at IS NULL ${orden}`,
            [seccion.id],
          )
    return {
      evaluaciones,
      sumaPonderaciones: evaluaciones.reduce((s, e) => s + e.ponderacion, 0),
    }
  }

  // La fecha debe estar dentro del período del curso de la sección; si no,
  // 400 con el rango del período.
  async crear(
    contexto: ContextoUniversidad,
    usuarioId: string,
    seccion: SeccionEspacio,
    datos: CrearEvaluacionDto,
  ): Promise<Evaluacion> {
    return this.bd.enTransaccionEnUniversidad(contexto, async (bd) => {
      const [creada] = await bd.query<Evaluacion>(
        `INSERT INTO evaluacion (universidad_id, seccion_id, nombre, fecha, ponderacion, creada_por)
         SELECT $1, s.id, $3, $4::date, $5, $6
           FROM seccion s
           JOIN curso c ON c.id = s.curso_id
           JOIN periodo p ON p.id = c.periodo_id
          WHERE s.universidad_id = $1 AND s.id = $2
            AND s.archived_at IS NULL AND c.archived_at IS NULL
            AND s.profesor_id = $6
            AND $4::date BETWEEN p.fecha_inicio AND p.fecha_termino
         RETURNING id, nombre, to_char(fecha, 'YYYY-MM-DD') AS fecha, ponderacion`,
        [
          contexto.universidadId,
          seccion.id,
          datos.nombre,
          datos.fecha,
          datos.ponderacion,
          usuarioId,
        ],
      )
      if (creada) {
        return creada
      }
      const [periodo] = await bd.query<{
        inicio: string
        termino: string
        es_profesor: boolean
      }>(
        `SELECT s.profesor_id = $3 AS es_profesor,
                to_char(p.fecha_inicio, 'YYYY-MM-DD') AS inicio,
                to_char(p.fecha_termino, 'YYYY-MM-DD') AS termino
           FROM seccion s
           JOIN curso c ON c.id = s.curso_id
           JOIN periodo p ON p.id = c.periodo_id
          WHERE s.universidad_id = $1 AND s.id = $2
            AND s.archived_at IS NULL AND c.archived_at IS NULL`,
        [contexto.universidadId, seccion.id, usuarioId],
      )
      // La sección se archivó, o el profesor se reasignó, después de que el
      // guard la verificara.
      if (!periodo) {
        throw new NotFoundException('La sección no existe')
      }
      if (!periodo.es_profesor) {
        throw new ForbiddenException(
          'Solo el profesor de la sección crea evaluaciones',
        )
      }
      throw new BadRequestException(
        `La fecha debe estar dentro del período del curso (del ${periodo.inicio} al ${periodo.termino})`,
      )
    })
  }
}
