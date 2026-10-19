import {
  createParamDecorator,
  type ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common'
import type { RequestConUsuario } from './jwt-auth.guard.js'

// Universidad del usuario de la sesión, tomada del JWT que validó
// JwtAuthGuard. Es el único punto del backend donde se lee: las consultas a
// tablas institucionales la reciben de aquí (ver
// BaseDeDatos.consultarEnUniversidad).
export const UniversidadActual = createParamDecorator(
  (_dato: unknown, contexto: ExecutionContext): string => {
    const { usuario } = contexto.switchToHttp().getRequest<RequestConUsuario>()
    // Solo pasa en una ruta @Public(), que no tiene sesión.
    if (!usuario?.universidad_id) {
      throw new UnauthorizedException()
    }
    return usuario.universidad_id
  },
)
