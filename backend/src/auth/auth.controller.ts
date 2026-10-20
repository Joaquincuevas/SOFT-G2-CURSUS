import type { UsuarioSesion } from '@cursus/shared'
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Put,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common'
import type { CookieOptions, Request, Response } from 'express'
import { AuthService, type TokensSesion } from './auth.service.js'
import { LoginDto } from './login.dto.js'
import { CambiarPasswordDto } from './cambiar-password.dto.js'
import type { RequestConUsuario } from './jwt-auth.guard.js'
import { SoloSesion } from './permisos.decorator.js'
import { Public } from './publico.decorator.js'
import { UniversidadActual } from './universidad-actual.decorator.js'
import type { ContextoUniversidad } from '../database/base-de-datos.service.js'
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

// Express no lee cookies sin cookie-parser; aquí basta con una. Un valor mal
// codificado (por ejemplo, "%") se trata como una cookie ausente: refresh y
// logout responden como sin cookie y la borran.
export function leerCookie(req: Request, nombre: string): string | undefined {
  for (const par of req.headers.cookie?.split(';') ?? []) {
    const [clave, ...valor] = par.trim().split('=')
    if (clave !== nombre) continue
    try {
      return decodeURIComponent(valor.join('='))
    } catch {
      return undefined
    }
  }
  return undefined
}

// 429 del login y del cambio de contraseña, con el header Retry-After.
function demasiadosIntentos(res: Response, retryAfter: number): never {
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
    const { resultado: tokens, retryAfter } = await this.limiteLogin.intentar(
      correo,
      ipLogin(req),
      (bd) => this.auth.iniciarSesion(correo, password, bd),
    )
    if (retryAfter) {
      demasiadosIntentos(res, retryAfter)
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

  // PER-02. Cambia la contraseña del usuario de la sesión, también la del
  // Director, y cierra sus demás sesiones. Una contraseña actual incorrecta
  // cuenta para el mismo límite de intentos por cuenta del login.
  @SoloSesion()
  @Put('password')
  @HttpCode(204)
  async cambiarPassword(
    @Body() { passwordActual, passwordNueva }: CambiarPasswordDto,
    @Req() req: RequestConUsuario,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const { sub, sid } = req.usuario ?? {}
    const correo = sub && (await this.auth.correoDe(sub))
    if (!sub || !sid || !correo) {
      throw new UnauthorizedException()
    }
    const { resultado, retryAfter } = await this.limiteLogin.intentar(
      correo,
      null,
      (bd) =>
        this.auth.cambiarPassword(sub, sid, passwordActual, passwordNueva, bd),
    )
    if (retryAfter) {
      demasiadosIntentos(res, retryAfter)
    }
    if (!resultado) {
      throw new BadRequestException('La contraseña actual no es correcta')
    }
    if (resultado === 'igual') {
      throw new BadRequestException(
        'La contraseña nueva debe ser distinta de la actual',
      )
    }
  }

  // Usuario de la sesión. 401 si el usuario del token ya no existe en la
  // universidad del token.
  @SoloSesion()
  @Get('yo')
  async yo(
    @Req() req: RequestConUsuario,
    @UniversidadActual() contexto: ContextoUniversidad,
  ): Promise<UsuarioSesion> {
    const usuario =
      req.usuario && (await this.auth.obtenerUsuario(req.usuario.sub, contexto))
    if (!usuario) {
      throw new UnauthorizedException()
    }
    return usuario
  }
}
