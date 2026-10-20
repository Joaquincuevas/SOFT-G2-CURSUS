import { resumirHorario } from '@cursus/shared'
import type { BloqueHorario, HorarioSeccion } from '@cursus/shared'
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  BaseDeDatos,
  type ContextoUniversidad,
} from '../database/base-de-datos.service.js'
import type { GuardarHorarioDto } from './guardar-horario.dto.js'
import { BLOQUES_HORARIO } from './horarios.sql.js'

const SECCION_VISIBLE = `FROM seccion s
  JOIN curso c ON c.id = s.curso_id
  JOIN carrera ca ON ca.id = c.carrera_id
  WHERE s.universidad_id = $1 AND s.id = $2
    AND s.archived_at IS NULL AND c.archived_at IS NULL
    AND ca.facultad_id = (SELECT facultad_id FROM usuario
                         WHERE universidad_id = $1 AND id = $3)`

@Injectable()
export class HorariosService {
  constructor(private readonly bd: BaseDeDatos) {}

  async obtener(
    contexto: ContextoUniversidad,
    usuarioId: string,
    seccionId: string,
  ): Promise<HorarioSeccion> {
    // Una sola consulta obtiene bloques y versión del mismo snapshot.
    const [horario] = await this.bd.consultarEnUniversidad<{
      version: number
      bloques: BloqueHorario[]
    }>(
      contexto,
      `SELECT s.horario_version AS version, ${BLOQUES_HORARIO} AS bloques ${SECCION_VISIBLE}`,
      [seccionId, usuarioId],
    )
    if (!horario) throw new NotFoundException('La sección no existe')
    return { ...horario, resumen: resumirHorario(horario.bloques) }
  }

  async guardar(
    contexto: ContextoUniversidad,
    usuarioId: string,
    seccionId: string,
    datos: GuardarHorarioDto,
  ): Promise<HorarioSeccion> {
    const bloques = [...datos.bloques].sort(
      (a, b) => a.dia - b.dia || a.inicio.localeCompare(b.inicio),
    )
    for (let i = 0; i < bloques.length; i++) {
      const actual = bloques[i]
      if (actual.inicio >= actual.termino) {
        throw new BadRequestException(
          'La hora de término debe ser posterior al inicio',
        )
      }
      const anterior = bloques[i - 1]
      if (anterior?.dia === actual.dia && anterior.termino > actual.inicio) {
        throw new BadRequestException(
          'Los bloques de una sección no pueden superponerse',
        )
      }
    }
    return this.bd.enTransaccionEnUniversidad(contexto, async (bd) => {
      const parametros = [contexto.universidadId, seccionId, usuarioId]
      const [seccion] = await bd.query<{ version: number }>(
        `SELECT s.horario_version AS version ${SECCION_VISIBLE} FOR UPDATE OF s, c`,
        parametros,
      )
      if (!seccion) throw new NotFoundException('La sección no existe')
      if (seccion.version !== datos.version) {
        throw new ConflictException(
          'El horario cambió. Vuelve a cargarlo antes de guardar.',
        )
      }
      // Reemplazo completo y atómico: se conservan las filas anteriores
      // archivadas, incluso al modificar o quitar el último bloque.
      await bd.query(
        `UPDATE horario_seccion SET archived_at = now()
        WHERE universidad_id = $1 AND seccion_id = $2 AND archived_at IS NULL`,
        parametros.slice(0, 2),
      )
      if (bloques.length) {
        await bd.query(
          `INSERT INTO horario_seccion (universidad_id, seccion_id, dia, inicio, termino, sala)
          SELECT $1, $2, b.dia, b.inicio::time, b.termino::time, b.sala
          FROM jsonb_to_recordset($3::jsonb) AS b(dia smallint, inicio text, termino text, sala text)`,
          [contexto.universidadId, seccionId, JSON.stringify(bloques)],
        )
      }
      await bd.query(
        `UPDATE seccion SET horario_version = horario_version + 1
        WHERE universidad_id = $1 AND id = $2`,
        parametros.slice(0, 2),
      )
      return {
        version: seccion.version + 1,
        bloques,
        resumen: resumirHorario(bloques),
      }
    })
  }
}
