import type { Carrera } from '@cursus/shared'
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { QueryFailedError } from 'typeorm'
import {
  BaseDeDatos,
  type ContextoUniversidad,
} from '../database/base-de-datos.service.js'

// El ámbito se vuelve a leer de usuario en cada sentencia: no se acepta un
// facultad_id del cliente ni se guarda en el JWT una asignación que pueda caducar.
const FACULTAD_ACTUAL = `JOIN facultad f ON f.id = u.facultad_id AND f.universidad_id = u.universidad_id
  WHERE u.universidad_id = $1 AND u.id = $2 AND u.rol = 'ADMINISTRATIVO'
    AND u.archived_at IS NULL AND f.archived_at IS NULL`

@Injectable()
export class CarrerasService {
  constructor(private readonly bd: BaseDeDatos) {}

  private exigirAdministrativo(contexto: ContextoUniversidad) {
    if (contexto.rol !== 'ADMINISTRATIVO') throw new ForbiddenException()
  }

  async listar(
    contexto: ContextoUniversidad,
    usuarioId: string,
  ): Promise<Carrera[]> {
    this.exigirAdministrativo(contexto)
    return this.bd.consultarEnUniversidad<Carrera>(
      contexto,
      `WITH ambito AS (SELECT u.facultad_id FROM usuario u ${FACULTAD_ACTUAL})
       SELECT c.id, c.nombre FROM carrera c JOIN ambito a ON a.facultad_id = c.facultad_id
       WHERE c.universidad_id = $1 AND c.archived_at IS NULL
       ORDER BY lower(c.nombre), c.id`,
      [usuarioId],
    )
  }

  async guardar(
    contexto: ContextoUniversidad,
    usuarioId: string,
    nombre: string,
    id?: string,
  ): Promise<Carrera> {
    this.exigirAdministrativo(contexto)
    try {
      const [carrera] = await this.bd.consultarEnUniversidad<Carrera>(
        contexto,
        id
          ? `WITH ambito AS (SELECT u.facultad_id FROM usuario u ${FACULTAD_ACTUAL}), editada AS (
             UPDATE carrera c SET nombre = $3 FROM ambito a
             WHERE c.universidad_id = $1 AND c.facultad_id = a.facultad_id
               AND c.id = $4 AND c.archived_at IS NULL RETURNING c.id, c.nombre)
             SELECT id, nombre FROM editada`
          : `INSERT INTO carrera (universidad_id, facultad_id, nombre)
             SELECT $1, u.facultad_id, $3 FROM usuario u ${FACULTAD_ACTUAL}
             RETURNING id, nombre`,
        id ? [usuarioId, nombre, id] : [usuarioId, nombre],
      )
      if (!carrera) {
        if (id) throw new NotFoundException('Carrera no encontrada')
        throw new ForbiddenException('No tienes una facultad activa asignada')
      }
      return carrera
    } catch (error) {
      if (error instanceof QueryFailedError) {
        const fallo = error.driverError as {
          code?: string
          constraint?: string
        }
        if (
          fallo.code === '23505' &&
          [
            'uq_carrera_facultad_nombre',
            'ux_carrera_facultad_nombre_normalizado',
          ].includes(fallo.constraint ?? '')
        ) {
          throw new ConflictException(
            'Ya existe una carrera con ese nombre en tu facultad',
          )
        }
      }
      throw error
    }
  }
}
