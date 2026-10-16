import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { JwtService } from '@nestjs/jwt'
import type { Request } from 'express'
import type { PayloadJwt } from './auth.service.js'
import { ES_PUBLICO } from './publico.decorator.js'

export type RequestConUsuario = Request & { usuario?: PayloadJwt }

// Guard global: toda ruta exige "Authorization: Bearer <jwt>" salvo las
// marcadas con @Public().
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
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
    return true
  }
}
