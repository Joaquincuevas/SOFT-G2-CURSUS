import {
  CODIGO_MFA_CODIGO_INVALIDO,
  CODIGO_MFA_DESAFIO_INVALIDO,
  type LoginMfaRequerido,
  type UsuarioSesion,
} from '@cursus/shared'
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
import { LoginMfaDto } from './login-mfa.dto.js'
import { CambiarPasswordDto } from './cambiar-password.dto.js'
import { PermitidaConProvisoria } from './credencial-provisoria.decorator.js'
import { PermitidaEgresado } from './permitida-egresado.decorator.js'
import type { RequestConUsuario } from './jwt-auth.guard.js'
import { SoloSesion } from './permisos.decorator.js'
import { Public } from './publico.decorator.js'
import { contextoDeLaSesion } from './universidad-actual.decorator.js'
import { LimiteLogin } from './limite-login.service.js'
import { ipLogin } from './ip-login.js'
import { RegistroEventos } from './registro-eventos.service.js'

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
    private readonly registro: RegistroEventos,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    // El ValidationPipe global valida el body con LoginDto.
    @Body() { correo, password }: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RespuestaLogin | LoginMfaRequerido> {
    // SEG-04: la IP es la que ya acepta el límite de intentos (la del proxy de
    // confianza o la del socket); sin una confiable, el evento no lleva IP.
    const ip = ipLogin(req)
    const { resultado, retryAfter } = await this.limiteLogin.intentar(
      correo,
      ip,
      (bd) => this.auth.iniciarSesion(correo, password, bd),
      // SEG-02: la contraseña correcta que espera el código no reinicia el
      // límite (ver LimiteLogin.intentar).
      (r) => !('desafio' in r),
    )
    // SEG-02: contraseña correcta con MFA activo. No hay sesión ni evento de
    // acceso todavía: el resultado se registra en el segundo paso.
    if (resultado && 'desafio' in resultado) {
      return { mfaRequerido: true, desafio: resultado.desafio }
    }
    const tokens = resultado
    // Después del commit del límite y antes de responder: no cambia la
    // respuesta ni la tumba (RegistroEventos no lanza).
    // Un éxito registra la cuenta que resolvió el login, no una nueva búsqueda.
    await (tokens
      ? this.registro.inicioSesion(
          { usuarioId: tokens.usuarioId },
          ip,
          'EXITOSO',
        )
      : this.registro.inicioSesion(
          { correo },
          ip,
          retryAfter ? 'BLOQUEADO' : 'FALLIDO',
        ))
    if (retryAfter) {
      demasiadosIntentos(res, retryAfter)
    }

    // Mismo mensaje si el correo no existe o la contraseña no calza.
    if (!tokens) {
      throw new UnauthorizedException('Credenciales inválidas')
    }
    return this.responder(res, tokens)
  }

  // SEG-02. Segundo paso del login con MFA: el desafío del paso 1 y el código
  // de la app. Cada código fallido cuenta para el límite de intentos de la
  // cuenta y de la IP (el mismo mecanismo del login). Sin código válido no se
  // emite sesión. Los mensajes no dicen nada del secreto ni del código.
  @Public()
  @Post('login/mfa')
  @HttpCode(200)
  async loginMfa(
    @Body() { desafio, codigo }: LoginMfaDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RespuestaLogin> {
    const ip = ipLogin(req)
    const lectura = await this.auth.desafioMfaDe(desafio)
    if (!lectura) {
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'La verificación expiró. Inicia sesión de nuevo.',
        error: 'Unauthorized',
        code: CODIGO_MFA_DESAFIO_INVALIDO,
      })
    }
    const { resultado: tokens, retryAfter } = await this.limiteLogin.intentar(
      // El límite por cuenta de los códigos es por usuario, no por correo.
      `usuario:${lectura.usuarioId}`,
      ip,
      (bd) => this.auth.completarMfa(lectura, codigo, bd),
    )
    await this.registro.inicioSesion(
      { usuarioId: lectura.usuarioId },
      ip,
      retryAfter ? 'BLOQUEADO' : tokens ? 'EXITOSO' : 'FALLIDO',
      'MFA',
    )
    if (retryAfter) {
      demasiadosIntentos(res, retryAfter)
    }
    if (!tokens) {
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'Código inválido o expirado',
        error: 'Unauthorized',
        code: CODIGO_MFA_CODIGO_INVALIDO,
      })
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
  // cuenta para el mismo límite de intentos por cuenta del login. Es la única
  // ruta, junto a /auth/yo, que acepta una contraseña provisoria (PER-03).
  @SoloSesion()
  @PermitidaConProvisoria()
  @PermitidaEgresado()
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
  // universidad del token. El superadmin responde aunque todavía no elija una
  // facultad (MT-04): así el frontend sabe que debe elegirla.
  @SoloSesion()
  @PermitidaConProvisoria()
  @PermitidaEgresado()
  @Get('yo')
  async yo(@Req() req: RequestConUsuario): Promise<UsuarioSesion> {
    const sub = req.usuario?.sub
    const usuario = !sub
      ? null
      : req.usuario?.rol === 'SUPERADMIN'
        ? await this.auth.obtenerSuperadmin(
            sub,
            req.eleccion ? contextoDeLaSesion(req) : null,
          )
        : await this.auth.obtenerUsuario(sub, contextoDeLaSesion(req))
    if (!usuario) {
      throw new UnauthorizedException()
    }
    return usuario
  }
}
