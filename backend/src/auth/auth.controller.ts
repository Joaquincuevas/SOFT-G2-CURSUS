import type { UsuarioSesion } from '@cursus/shared'
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common'
import type { CookieOptions, Request, Response } from 'express'
import { AuthService, type TokensSesion } from './auth.service.js'
import { LoginDto } from './login.dto.js'
import type { RequestConUsuario } from './jwt-auth.guard.js'
import { SoloSesion } from './permisos.decorator.js'
import { Public } from './publico.decorator.js'
import { UniversidadActual } from './universidad-actual.decorator.js'
import { LimiteLogin } from './limite-login.service.js'
import { ipLogin } from './ip-login.js'

export interface RespuestaLogin {
  accessToken: string
}

export const COOKIE_REFRESH = 'refresh'

// La cookie solo viaja a /api/auth (login, refresh y logout), nunca desde otro
// sitio, y JavaScript no puede leerla. Secure exige https: se activa en la
// imagen Docker (staging y producción) y no en local.
const opcionesCookie = (): CookieOptions => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/api/auth',
})

// Express no lee cookies sin cookie-parser; aquí basta con una.
export function leerCookie(req: Request, nombre: string): string | undefined {
  for (const par of req.headers.cookie?.split(';') ?? []) {
    const [clave, ...valor] = par.trim().split('=')
    if (clave === nombre) return decodeURIComponent(valor.join('='))
  }
  return undefined
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly limiteLogin: LimiteLogin,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    // El ValidationPipe global valida el body con LoginDto.
    @Body() { correo, password }: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RespuestaLogin> {
    const { tokens, retryAfter } = await this.limiteLogin.intentar(
      correo,
      ipLogin(req),
      (bd) => this.auth.iniciarSesion(correo, password, bd),
    )
    if (retryAfter) {
      res.setHeader('Retry-After', retryAfter.toString())
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message:
            'Demasiados intentos fallidos. Espera antes de volver a intentar.',
          retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      )
    }

    // Mismo mensaje si el correo no existe o la contraseña no calza.
    if (!tokens) {
      throw new UnauthorizedException('Credenciales inválidas')
    }
    return this.responder(res, tokens)
  }

  // Entrega un JWT nuevo a cambio del refresh token de la cookie, que se rota.
  // Si no es válido, borra la cookie y responde 401.
  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RespuestaLogin> {
    const actual = leerCookie(req, COOKIE_REFRESH)
    const tokens = actual && (await this.auth.renovarSesion(actual))
    if (!tokens) {
      res.clearCookie(COOKIE_REFRESH, opcionesCookie())
      throw new UnauthorizedException()
    }
    return this.responder(res, tokens)
  }

  // Revoca el refresh token de la cookie y la borra. Responde 204 aunque no
  // haya cookie o el token ya no sirva.
  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const actual = leerCookie(req, COOKIE_REFRESH)
    if (actual) {
      await this.auth.cerrarSesion(actual)
    }
    res.clearCookie(COOKIE_REFRESH, opcionesCookie())
  }

  private responder(res: Response, tokens: TokensSesion): RespuestaLogin {
    res.cookie(COOKIE_REFRESH, tokens.refreshToken, {
      ...opcionesCookie(),
      maxAge: this.auth.segundosRefresh * 1000,
    })
    return { accessToken: tokens.accessToken }
  }

  // Usuario de la sesión. 401 si el usuario del token ya no existe en la
  // universidad del token.
  @SoloSesion()
  @Get('yo')
  async yo(
    @Req() req: RequestConUsuario,
    @UniversidadActual() universidadId: string,
  ): Promise<UsuarioSesion> {
    const usuario =
      req.usuario &&
      (await this.auth.obtenerUsuario(req.usuario.sub, universidadId))
    if (!usuario) {
      throw new UnauthorizedException()
    }
    return usuario
  }
}
