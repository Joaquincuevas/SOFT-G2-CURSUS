import {
  EVALUACION_CON_NOTAS,
  type Evaluacion,
  type EvaluacionesSeccion,
  type SeccionEspacio,
} from '@cursus/shared'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  BaseDeDatos,
  fijarUsuario,
  type ContextoUniversidad,
} from '../database/base-de-datos.service.js'
import type { CrearEvaluacionDto } from './crear-evaluacion.dto.js'
import { bloquearPonderaciones } from './ponderaciones.service.js'
import { bloquearNotasDe } from './bloqueo-notas.js'

// La base devuelve las fechas como YYYY-MM-DD, sin conversión de zona horaria.
const COLUMNAS = `e.id, e.nombre, to_char(e.fecha, 'YYYY-MM-DD') AS fecha,
  e.ponderacion`

// Una nota ingresada sigue contando aunque se archive.
const TIENE_NOTAS = `EXISTS (SELECT 1 FROM nota n
  WHERE n.evaluacion_id = e.id AND n.universidad_id = e.universidad_id) AS "tieneNotas"`

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
    const columnas =
      seccion.rol === 'PROFESOR' ? `${COLUMNAS}, ${TIENE_NOTAS}` : COLUMNAS
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
            `SELECT ${columnas} FROM evaluacion e
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
      await bloquearPonderaciones(bd, contexto, seccion.id)
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

  async editar(
    contexto: ContextoUniversidad,
    usuarioId: string,
    seccion: SeccionEspacio,
    evaluacionId: string,
    datos: CrearEvaluacionDto,
  ): Promise<Evaluacion> {
    if (contexto.rol !== 'PROFESOR' || seccion.rol !== 'PROFESOR')
      throw new ForbiddenException()

    return this.bd.enTransaccionEnUniversidad(contexto, async (bd) => {
      // Primero el lock de ponderaciones de la sección, después el de notas.
      await bloquearPonderaciones(bd, contexto, seccion.id)
      await bloquearNotasDe(bd, evaluacionId)
      const [actual] = await bd.query<
        Evaluacion & {
          profesorId: string | null
          inicio: string
          termino: string
        }
      >(
        `SELECT ${COLUMNAS}, ${TIENE_NOTAS},
                s.profesor_id AS "profesorId",
                to_char(p.fecha_inicio, 'YYYY-MM-DD') AS inicio,
                to_char(p.fecha_termino, 'YYYY-MM-DD') AS termino
           FROM evaluacion e
           JOIN seccion s ON s.id = e.seccion_id AND s.universidad_id = e.universidad_id
           JOIN curso c ON c.id = s.curso_id AND c.universidad_id = s.universidad_id
           JOIN periodo p ON p.id = c.periodo_id AND p.universidad_id = c.universidad_id
          WHERE e.universidad_id = $1 AND s.id = $2 AND e.id = $3
            AND e.archived_at IS NULL AND s.archived_at IS NULL
            AND c.archived_at IS NULL
          FOR UPDATE OF e FOR SHARE OF s, c, p`,
        [contexto.universidadId, seccion.id, evaluacionId],
      )
      if (!actual) throw new NotFoundException('La evaluación no existe')
      if (actual.profesorId !== usuarioId)
        throw new ForbiddenException(
          'Solo el profesor de la sección edita evaluaciones',
        )
      if (actual.tieneNotas) throw new ConflictException(EVALUACION_CON_NOTAS)
      if (datos.fecha < actual.inicio || datos.fecha > actual.termino)
        throw new BadRequestException(
          `La fecha debe estar dentro del período del curso (del ${actual.inicio} al ${actual.termino})`,
        )

      const { id, nombre, fecha, ponderacion } = actual
      if (
        nombre === datos.nombre &&
        fecha === datos.fecha &&
        ponderacion === datos.ponderacion
      )
        return { id, nombre, fecha, ponderacion }

      await fijarUsuario(bd, usuarioId)
      await bd.query(
        `UPDATE evaluacion SET nombre = $3, fecha = $4::date, ponderacion = $5
          WHERE universidad_id = $1 AND id = $2`,
        [
          contexto.universidadId,
          id,
          datos.nombre,
          datos.fecha,
          datos.ponderacion,
        ],
      )
      await bd.query(
        `INSERT INTO evaluacion_cambio
           (universidad_id, evaluacion_id, responsable_id, anterior, nuevo)
         VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)`,
        [
          contexto.universidadId,
          id,
          usuarioId,
          { nombre, fecha, ponderacion },
          datos,
        ],
      )
      return {
        id,
        nombre: datos.nombre,
        fecha: datos.fecha,
        ponderacion: datos.ponderacion,
      }
    })
  }
}
