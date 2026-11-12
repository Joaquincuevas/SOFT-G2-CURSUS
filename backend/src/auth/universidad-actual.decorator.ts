import {
  createParamDecorator,
  type ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common'
import type { ContextoUniversidad } from '../database/base-de-datos.service.js'
import type { RequestConUsuario } from './jwt-auth.guard.js'

export const DEBE_ELEGIR_FACULTAD =
  'Elige una universidad y una facultad para continuar'

// Universidad y rol de la sesión, tomados del JWT que validó JwtAuthGuard. Es
// el único punto del backend donde se resuelven: las consultas a tablas
// institucionales los reciben de aquí (ver BaseDeDatos.consultarEnUniversidad).
//
// MT-04 (ADR 0002): el superadmin no tiene universidad propia. Trabaja en la
// universidad y la facultad que eligió en su sesión, como el Administrativo
// de esa facultad, así que su contexto lleva el rol ADMINISTRATIVO y los datos
// del superadmin para la auditoría. Mientras no elija una, responde 403.
export function contextoDeLaSesion(
  req: RequestConUsuario,
): ContextoUniversidad {
  const { usuario, eleccion } = req
  // Solo pasa en una ruta @Public(), que no tiene sesión.
  if (!usuario?.sub || !usuario.rol) {
    throw new UnauthorizedException()
  }
  if (usuario.rol === 'SUPERADMIN') {
    if (!eleccion) {
      throw new ForbiddenException(DEBE_ELEGIR_FACULTAD)
    }
    return {
      universidadId: eleccion.universidadId,
      rol: 'ADMINISTRATIVO',
      superadmin: { id: usuario.sub, facultadId: eleccion.facultadId },
    }
  }
  if (!usuario.universidad_id) {
    throw new UnauthorizedException()
  }
  return { universidadId: usuario.universidad_id, rol: usuario.rol }
}

export const UniversidadActual = createParamDecorator(
  (_dato: unknown, contexto: ExecutionContext): ContextoUniversidad =>
    contextoDeLaSesion(contexto.switchToHttp().getRequest<RequestConUsuario>()),
)
