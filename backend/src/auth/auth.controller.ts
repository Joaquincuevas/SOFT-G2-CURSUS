import type { UsuarioSesion } from '@cursus/shared'
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common'
import { AuthService } from './auth.service.js'
import type { RequestConUsuario } from './jwt-auth.guard.js'
import { SoloSesion } from './permisos.decorator.js'
import { Public } from './publico.decorator.js'

// Argon2 procesa la contraseña completa: se limita su largo para que una
// petición no pueda consumir CPU con textos enormes.
const LARGO_MAXIMO = 256

export interface RespuestaLogin {
  accessToken: string
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() body: unknown): Promise<RespuestaLogin> {
    const { correo, password } = (body ?? {}) as Record<string, unknown>
    if (
      typeof correo !== 'string' ||
      typeof password !== 'string' ||
      !correo ||
      !password ||
      correo.length > LARGO_MAXIMO ||
      password.length > LARGO_MAXIMO
    ) {
      throw new BadRequestException('Correo y contraseña son obligatorios')
    }

    const accessToken = await this.auth.iniciarSesion(correo, password)
    // Mismo mensaje si el correo no existe o la contraseña no calza.
    if (!accessToken) {
      throw new UnauthorizedException('Credenciales inválidas')
    }
    return { accessToken }
  }

  // Usuario de la sesión. 401 si el usuario del token ya no existe.
  @SoloSesion()
  @Get('yo')
  async yo(@Req() req: RequestConUsuario): Promise<UsuarioSesion> {
    const usuario =
      req.usuario && (await this.auth.obtenerUsuario(req.usuario.sub))
    if (!usuario) {
      throw new UnauthorizedException()
    }
    return usuario
  }
}
