import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { JwtService } from '@nestjs/jwt'
import type { Request } from 'express'
import { AuthService, type PayloadJwt } from './auth.service.js'
import { PERMITIDA_CON_PROVISORIA } from './credencial-provisoria.decorator.js'
import { ES_PUBLICO } from './publico.decorator.js'

export type RequestConUsuario = Request & { usuario?: PayloadJwt }

// Guard global: toda ruta exige "Authorization: Bearer <jwt>" salvo las
// marcadas con @Public(). Un usuario con contraseña provisoria solo entra a
// las marcadas con @PermitidaConProvisoria().
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly auth: AuthService,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const esPublico = this.reflector.getAllAndOverride<boolean>(ES_PUBLICO, [
      contexto.getHandler(),
      contexto.getClass(),
    ])
    if (esPublico) {
      return true
    }

    const req = contexto.switchToHttp().getRequest<RequestConUsuario>()
    const [tipo, token] = req.headers.authorization?.split(' ') ?? []
    if (tipo !== 'Bearer' || !token) {
      throw new UnauthorizedException()
    }
    try {
      req.usuario = await this.jwt.verifyAsync<PayloadJwt>(token)
    } catch {
      throw new UnauthorizedException()
    }
    const { sid, sub } = req.usuario
    const sesion =
      typeof sid === 'string' &&
      typeof sub === 'string' &&
      (await this.auth.sesionActiva(sid, sub))
    if (!sesion) {
      throw new UnauthorizedException()
    }
    // PER-03. Con la contraseña provisoria solo se puede consultar la sesión y
    // cambiarla. Se lee de la base y no del JWT, para que el cambio rija
    // apenas se guarda.
    if (
      sesion.credencialProvisoria &&
      !this.reflector.getAllAndOverride<boolean>(PERMITIDA_CON_PROVISORIA, [
        contexto.getHandler(),
        contexto.getClass(),
      ])
    ) {
      throw new ForbiddenException(
        'Debes cambiar tu contraseña provisoria antes de continuar',
      )
    }
    return true
  }
}
