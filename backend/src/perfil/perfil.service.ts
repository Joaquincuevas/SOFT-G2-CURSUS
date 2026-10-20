import type { PerfilActualizado } from '@cursus/shared'
import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import {
  BaseDeDatos,
  type ContextoUniversidad,
} from '../database/base-de-datos.service.js'

@Injectable()
export class PerfilService {
  constructor(private readonly bd: BaseDeDatos) {}

  // PER-01. El usuario de la sesión cambia su propio nombre: el id sale del
  // JWT, nunca de la petición. El Director no modifica datos (ADR 0001), así
  // que ve su perfil en solo lectura; RLS también se lo impediría.
  async actualizarNombre(
    contexto: ContextoUniversidad,
    usuarioId: string,
    nombre: string,
  ): Promise<PerfilActualizado> {
    if (contexto.rol === 'DIRECTOR') {
      throw new ForbiddenException('El Director ve su perfil en solo lectura')
    }
    // En un CTE porque TypeORM devuelve [filas, afectadas] para un UPDATE
    // suelto.
    const [fila] = await this.bd.consultarEnUniversidad<{ nombre: string }>(
      contexto,
      `WITH actualizado AS (
         UPDATE usuario SET nombre = $3
          WHERE universidad_id = $1 AND id = $2 AND archived_at IS NULL
          RETURNING nombre
       )
       SELECT nombre FROM actualizado`,
      [usuarioId, nombre],
    )
    // Sin fila: el usuario del token ya no existe o fue archivado.
    if (!fila) {
      throw new UnauthorizedException()
    }
    return { nombre: fila.nombre }
  }
}
