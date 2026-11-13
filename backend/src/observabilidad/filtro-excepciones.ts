import {
  type ArgumentsHost,
  Catch,
  HttpException,
  Logger,
} from '@nestjs/common'
import { BaseExceptionFilter } from '@nestjs/core'
import type { Request } from 'express'
import { rutaDe } from './solicitud.middleware.js'

// OBS-01. Registra los 5xx con su stack (redactado por el logger) y deja que
// Nest responda como siempre: la respuesta al cliente no cambia. Un error que
// no es HttpException sigue siendo 500 «Internal server error»; lo único que
// se evita es el log propio de Nest, que sería una segunda línea. El
// requestId va en la cabecera X-Request-Id de todas las respuestas; no se
// agrega al cuerpo para no cambiar contratos como el del health check.
// Los 4xx esperados no se registran aquí: la línea de acceso ya los deja en
// nivel warn, sin stack.
@Catch()
export class FiltroExcepciones extends BaseExceptionFilter {
  private readonly logger = new Logger('Excepciones')

  catch(excepcion: unknown, host: ArgumentsHost) {
    const http =
      excepcion instanceof HttpException
        ? excepcion
        : // La respuesta exacta del 500 por defecto de Nest.
          new HttpException(
            { statusCode: 500, message: 'Internal server error' },
            500,
          )
    if (http.getStatus() >= 500) {
      const req = host.switchToHttp().getRequest<Request>()
      this.logger.error({
        message: 'error del servidor',
        method: req.method,
        route: rutaDe(req),
        status: http.getStatus(),
        error:
          excepcion instanceof Error
            ? excepcion
            : { name: 'ErrorDesconocido', message: String(excepcion) },
      })
    }
    super.catch(http, host)
  }
}
