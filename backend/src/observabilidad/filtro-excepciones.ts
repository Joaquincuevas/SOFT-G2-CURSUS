import {
  type ArgumentsHost,
  Catch,
  HttpException,
  Logger,
} from '@nestjs/common'
import { BaseExceptionFilter } from '@nestjs/core'
import type { Request } from 'express'
import { errorSeguro } from './redaccion.js'
import { rutaDe } from './solicitud.middleware.js'

// OBS-01. Registra los 5xx (tipo, código y frames del stack, sin el texto del
// error) y deja que
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
      // Mensaje fijo: el texto de la excepción no se escribe. Va el tipo, el
      // código y dónde ocurrió (errorSeguro, que aplica el logger); no su mensaje ni la primera
      // línea del stack, que pueden traer datos sin etiqueta.
      this.logger.error({
        message: 'error del servidor',
        method: req.method,
        route: rutaDe(req),
        status: http.getStatus(),
        // El logger lo reduce con errorSeguro: tipo, código y frames.
        error: excepcion instanceof Error ? excepcion : errorSeguro(excepcion),
      })
    }
    super.catch(http, host)
  }
}
