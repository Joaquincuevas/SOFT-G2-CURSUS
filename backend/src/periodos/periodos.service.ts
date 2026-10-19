import type { Periodo } from '@cursus/shared'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  BaseDeDatos,
  type ContextoUniversidad,
} from '../database/base-de-datos.service.js'
import type { CrearPeriodoDto } from './crear-periodo.dto.js'

const COLUMNAS = `id, anio, semestre, activo,
  to_char(fecha_inicio, 'YYYY-MM-DD') AS "fechaInicio",
  to_char(fecha_termino, 'YYYY-MM-DD') AS "fechaTermino"`

@Injectable()
export class PeriodosService {
  constructor(private readonly bd: BaseDeDatos) {}

  listar(contexto: ContextoUniversidad): Promise<Periodo[]> {
    return this.bd.consultarEnUniversidad<Periodo>(
      contexto,
      `SELECT ${COLUMNAS} FROM periodo WHERE universidad_id = $1
       ORDER BY activo DESC, anio DESC, semestre DESC`,
    )
  }

  async crear(
    contexto: ContextoUniversidad,
    datos: CrearPeriodoDto,
  ): Promise<Periodo> {
    this.exigirAdministrativo(contexto)
    if (datos.fechaTermino <= datos.fechaInicio) {
      throw new BadRequestException(
        'La fecha de término debe ser posterior a la de inicio',
      )
    }
    try {
      return await this.bd.enTransaccionEnUniversidad(contexto, async (bd) => {
        const parametros = [contexto.universidadId]
        // Todas las escrituras toman este bloqueo primero, incluso si todavía
        // no hay períodos. El índice parcial sigue siendo la última defensa.
        await bd.query(
          'SELECT id FROM universidad WHERE id = $1 FOR UPDATE',
          parametros,
        )
        if (datos.activo) {
          await bd.query(
            'UPDATE periodo SET activo = false, updated_at = now() WHERE universidad_id = $1 AND activo',
            parametros,
          )
        }
        const [periodo] = await bd.query<Periodo>(
          `INSERT INTO periodo (universidad_id, anio, semestre, fecha_inicio, fecha_termino, activo)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${COLUMNAS}`,
          [
            ...parametros,
            datos.anio,
            datos.semestre,
            datos.fechaInicio,
            datos.fechaTermino,
            datos.activo,
          ],
        )
        return periodo
      })
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictException(
          'Ya existe un período con ese año y semestre en tu universidad',
        )
      }
      throw error
    }
  }

  async activar(contexto: ContextoUniversidad, id: string): Promise<Periodo> {
    this.exigirAdministrativo(contexto)
    return this.bd.enTransaccionEnUniversidad(contexto, async (bd) => {
      const parametros = [contexto.universidadId]
      await bd.query(
        'SELECT id FROM universidad WHERE id = $1 FOR UPDATE',
        parametros,
      )
      const [existente] = await bd.query<Periodo>(
        `SELECT ${COLUMNAS} FROM periodo WHERE universidad_id = $1 AND id = $2`,
        [...parametros, id],
      )
      if (!existente) throw new NotFoundException('El período no existe')
      await bd.query(
        'UPDATE periodo SET activo = false, updated_at = now() WHERE universidad_id = $1 AND activo AND id <> $2',
        [...parametros, id],
      )
      // El SELECT exterior evita la forma [filas, cantidad] de UPDATE de TypeORM.
      const [periodo] = await bd.query<Periodo>(
        `WITH activado AS (
        UPDATE periodo SET activo = true, updated_at = now()
        WHERE universidad_id = $1 AND id = $2 RETURNING *
      ) SELECT ${COLUMNAS} FROM activado`,
        [...parametros, id],
      )
      return periodo
    })
  }

  private exigirAdministrativo(contexto: ContextoUniversidad) {
    if (contexto.rol !== 'ADMINISTRATIVO') throw new ForbiddenException()
  }
}
