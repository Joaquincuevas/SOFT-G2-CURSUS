import { definirAbilityPara } from '@cursus/shared'
import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { RequestConUsuario } from './jwt-auth.guard.js'
import { PERMISO, type Permiso } from './permisos.decorator.js'
import { ES_PUBLICO } from './publico.decorator.js'

// Guard global que corre después de JwtAuthGuard: cada ruta debe declarar
// quién puede usarla con @Puede() o @SoloSesion(). Si no lo declara, o el rol
// no tiene el permiso, responde 403.
@Injectable()
export class PermisosGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(contexto: ExecutionContext): boolean {
    const objetivos = [contexto.getHandler(), contexto.getClass()]
    if (this.reflector.getAllAndOverride<boolean>(ES_PUBLICO, objetivos)) {
      return true
    }

    const permiso = this.reflector.getAllAndOverride<
      Permiso | 'sesion' | undefined
    >(PERMISO, objetivos)
    const { usuario } = contexto.switchToHttp().getRequest<RequestConUsuario>()
    if (!permiso || !usuario) {
      throw new ForbiddenException()
    }
    if (permiso === 'sesion') {
      return true
    }

    const ability = definirAbilityPara(usuario)
    if (!ability.can(permiso.accion, permiso.sujeto)) {
      throw new ForbiddenException()
    }
    return true
  }
}
