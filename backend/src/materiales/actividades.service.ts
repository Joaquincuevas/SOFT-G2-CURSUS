import {
  type Actividad,
  type SeccionEspacio,
  ZONA_HORARIA_UNIVERSIDAD,
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
import type { CrearActividadDto } from './crear-actividad.dto.js'

// Una actividad está cerrada cuando su plazo ya pasó, según la hora del
// servidor: no se guarda, así que se cierra sola.
const COLUMNAS = `a.id, a.titulo, a.instrucciones, a.plazo,
  a.plazo <= now() AS cerrada`

interface FilaActividad {
  id: string
  titulo: string
  instrucciones: string
  plazo: Date
  cerrada: boolean
}

const actividad = (fila: FilaActividad): Actividad => ({
  id: fila.id,
  titulo: fila.titulo,
  instrucciones: fila.instrucciones,
  plazo: fila.plazo.toISOString(),
  cerrada: fila.cerrada,
})

// MAT-08 (RN-08): actividades de entrega de una sección que
// IntegranteSeccionGuard ya verificó. El controlador decide quién lee y
// quién crea.
@Injectable()
export class ActividadesService {
  constructor(private readonly bd: BaseDeDatos) {}

  // Activas, por plazo. El Director las lee en cualquier universidad, en una
  // transacción READ ONLY.
  async listar(
    contexto: ContextoUniversidad,
    seccion: SeccionEspacio,
  ): Promise<Actividad[]> {
    const orden = 'ORDER BY a.plazo, a.titulo, a.id'
    const filas =
      contexto.rol === 'DIRECTOR'
        ? await this.bd.consultarEnTodasLasUniversidades<FilaActividad>(
            contexto,
            `SELECT ${COLUMNAS} FROM actividad a
              WHERE a.seccion_id = $1 AND a.archived_at IS NULL ${orden}`,
            [seccion.id],
          )
        : await this.bd.consultarEnUniversidad<FilaActividad>(
            contexto,
            `SELECT ${COLUMNAS} FROM actividad a
              WHERE a.universidad_id = $1 AND a.seccion_id = $2
                AND a.archived_at IS NULL ${orden}`,
            [seccion.id],
          )
    return filas.map(actividad)
  }

  // La fecha y la hora límite son de Chile. El plazo debe ser futuro y su
  // fecha debe estar dentro del período del curso de la sección; si no, 400
  // con el motivo.
  async crear(
    contexto: ContextoUniversidad,
    usuarioId: string,
    seccion: SeccionEspacio,
    datos: CrearActividadDto,
  ): Promise<Actividad> {
    return this.bd.enTransaccionEnUniversidad(contexto, async (bd) => {
      const [creada] = await bd.query<FilaActividad>(
        `INSERT INTO actividad (universidad_id, seccion_id, titulo, instrucciones, plazo, creada_por)
         SELECT $1, s.id, $3, $4, ($5::date + $6::time) AT TIME ZONE $8, $7
           FROM seccion s
           JOIN curso c ON c.id = s.curso_id
           JOIN periodo p ON p.id = c.periodo_id
          WHERE s.universidad_id = $1 AND s.id = $2
            AND s.archived_at IS NULL AND c.archived_at IS NULL
            AND s.profesor_id = $7
            AND $5::date BETWEEN p.fecha_inicio AND p.fecha_termino
            AND ($5::date + $6::time) AT TIME ZONE $8 > now()
         RETURNING id, titulo, instrucciones, plazo, plazo <= now() AS cerrada`,
        [
          contexto.universidadId,
          seccion.id,
          datos.titulo,
          datos.instrucciones,
          datos.fecha,
          datos.hora,
          usuarioId,
          ZONA_HORARIA_UNIVERSIDAD,
        ],
      )
      if (creada) {
        return actividad(creada)
      }
      const [motivo] = await bd.query<{
        es_profesor: boolean
        en_periodo: boolean
        inicio: string
        termino: string
      }>(
        `SELECT s.profesor_id = $3 AS es_profesor,
                $4::date BETWEEN p.fecha_inicio AND p.fecha_termino AS en_periodo,
                to_char(p.fecha_inicio, 'YYYY-MM-DD') AS inicio,
                to_char(p.fecha_termino, 'YYYY-MM-DD') AS termino
           FROM seccion s
           JOIN curso c ON c.id = s.curso_id
           JOIN periodo p ON p.id = c.periodo_id
          WHERE s.universidad_id = $1 AND s.id = $2
            AND s.archived_at IS NULL AND c.archived_at IS NULL`,
        [contexto.universidadId, seccion.id, usuarioId, datos.fecha],
      )
      // La sección se archivó, o el profesor se reasignó, después de que el
      // guard la verificara.
      if (!motivo) {
        throw new NotFoundException('La sección no existe')
      }
      if (!motivo.es_profesor) {
        throw new ForbiddenException(
          'Solo el profesor de la sección crea actividades',
        )
      }
      if (!motivo.en_periodo) {
        throw new BadRequestException(
          `La fecha límite debe estar dentro del período del curso (del ${motivo.inicio} al ${motivo.termino})`,
        )
      }
      throw new BadRequestException(
        'La fecha y hora límite deben ser posteriores a la hora actual',
      )
    })
  }
}
