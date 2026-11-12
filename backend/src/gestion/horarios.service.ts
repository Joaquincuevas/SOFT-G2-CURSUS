import { CODIGO_SALA_OCUPADA, resumirHorario } from '@cursus/shared'
import type { BloqueHorario, ChoqueSala, HorarioSeccion } from '@cursus/shared'
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
    AND ca.facultad_id = facultad_actual($3)`

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
      // Antes de bloquear sección/curso: serializa los guardados de horarios
      // de una universidad, incluso entre facultades y cursos diferentes.
      // La consulta siguiente usa un snapshot posterior a la espera (READ COMMITTED).
      await bd.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
        `ocupacion-salas:${contexto.universidadId}`,
      ])
      const [seccion] = await bd.query<{ version: number; periodo: string }>(
        `SELECT s.horario_version AS version, c.periodo_id AS periodo ${SECCION_VISIBLE} FOR UPDATE OF s, c`,
        parametros,
      )
      if (!seccion) throw new NotFoundException('La sección no existe')
      if (seccion.version !== datos.version) {
        throw new ConflictException(
          'El horario cambió. Vuelve a cargarlo antes de guardar.',
        )
      }
      if (bloques.length) {
        const choques = await bd.query<ChoqueSala>(
          `SELECT DISTINCT h.sala, h.dia,
            to_char(h.inicio, 'HH24:MI') AS inicio,
            to_char(h.termino, 'HH24:MI') AS termino,
            c.codigo AS "cursoCodigo", c.nombre AS "cursoNombre",
            s.numero AS "seccionNumero"
          FROM horario_seccion h
          JOIN seccion s ON s.id = h.seccion_id AND s.universidad_id = h.universidad_id
          JOIN curso c ON c.id = s.curso_id AND c.universidad_id = s.universidad_id
          JOIN jsonb_to_recordset($4::jsonb) AS b(dia smallint, inicio text, termino text, sala text)
            ON h.dia = b.dia AND h.inicio < b.termino::time AND h.termino > b.inicio::time
            AND lower(regexp_replace(btrim(h.sala), '\\s+', ' ', 'g')) = lower(b.sala)
          WHERE h.universidad_id = $1 AND s.id <> $2 AND c.periodo_id = $3
            AND h.archived_at IS NULL AND s.archived_at IS NULL AND c.archived_at IS NULL
          ORDER BY h.dia, inicio, c.codigo, s.numero, h.sala, termino, c.nombre`,
          [
            contexto.universidadId,
            seccionId,
            seccion.periodo,
            JSON.stringify(bloques),
          ],
        )
        if (choques.length) {
          throw new ConflictException({
            statusCode: 409,
            code: CODIGO_SALA_OCUPADA,
            message:
              'La sala ya está ocupada. Cambia la sala, el día o las horas antes de guardar.',
            choques,
          })
        }
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
