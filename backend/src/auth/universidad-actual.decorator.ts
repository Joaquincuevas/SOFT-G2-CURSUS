import {
  createParamDecorator,
  type ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common'
import type { ContextoUniversidad } from '../database/base-de-datos.service.js'
import type { RequestConUsuario } from './jwt-auth.guard.js'

// Universidad y rol del usuario de la sesión, tomados del JWT que validó
// JwtAuthGuard. Es el único punto del backend donde se leen: las consultas a
// tablas institucionales los reciben de aquí (ver
// BaseDeDatos.consultarEnUniversidad).
export const UniversidadActual = createParamDecorator(
  (_dato: unknown, contexto: ExecutionContext): ContextoUniversidad => {
    const { usuario } = contexto.switchToHttp().getRequest<RequestConUsuario>()
    // Solo pasa en una ruta @Public(), que no tiene sesión.
    if (!usuario?.universidad_id || !usuario.rol) {
      throw new UnauthorizedException()
    }
    return { universidadId: usuario.universidad_id, rol: usuario.rol }
  },
)
