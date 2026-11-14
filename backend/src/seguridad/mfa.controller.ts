import type { EstadoMfa, InicioMfa } from '@cursus/shared'
import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common'
import type { RequestConUsuario } from '../auth/jwt-auth.guard.js'
import { SoloSesion } from '../auth/permisos.decorator.js'
import { PermitidaEgresado } from '../auth/permitida-egresado.decorator.js'
import { ConfirmarMfaDto } from './confirmar-mfa.dto.js'
import { MfaService } from './mfa.service.js'

// SEG-01. MFA del usuario de la sesión, desde su perfil. Como el cambio de
// contraseña, vale para todos los roles y también para el alumno egresado. No
// se acepta con contraseña provisoria (PER-03): primero debe cambiarla.
@Controller('perfil/mfa')
export class MfaController {
  constructor(private readonly mfa: MfaService) {}

  @SoloSesion()
  @PermitidaEgresado()
  @Get()
  estado(@Req() req: RequestConUsuario): Promise<EstadoMfa> {
    return this.mfa.estado(usuarioDe(req))
  }

  // La respuesta trae el secreto: no se guarda en ningún caché.
  @SoloSesion()
  @PermitidaEgresado()
  @Post('inicio')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  iniciar(@Req() req: RequestConUsuario): Promise<InicioMfa> {
    return this.mfa.iniciar(usuarioDe(req))
  }

  @SoloSesion()
  @PermitidaEgresado()
  @Post('confirmacion')
  @HttpCode(204)
  confirmar(
    @Req() req: RequestConUsuario,
    @Body() { codigo }: ConfirmarMfaDto,
  ): Promise<void> {
    return this.mfa.confirmar(usuarioDe(req), codigo)
  }
}

// El id sale siempre del JWT, nunca de la petición.
function usuarioDe(req: RequestConUsuario): string {
  const sub = req.usuario?.sub
  if (!sub) {
    throw new UnauthorizedException()
  }
  return sub
}
