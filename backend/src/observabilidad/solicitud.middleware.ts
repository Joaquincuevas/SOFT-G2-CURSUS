import { Logger } from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'
import {
  contextoSolicitud,
  HEADER_REQUEST_ID,
  requestIdDe,
} from './contexto-solicitud.js'

const logger = new Logger('Acceso')
const ES_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// El health check del contenedor llama cada pocos segundos: baja a debug.
const SALUD = /^\/api\/health(\/|$)/

// Patrón de la ruta atendida (/api/espacio/secciones/:id), nunca la URL real:
// no lleva query string ni ids que identifiquen a alguien. Sin ruta (404 de un
// camino inexistente) no se escribe lo que mandó el cliente.
export function rutaDe(req: Request): string {
  const patron = (req.route as { path?: unknown } | undefined)?.path
  // Nest registra un comodín (/api*path) para el prefijo global: los caminos
  // que no existen caen ahí y no son una ruta.
  return typeof patron === 'string' && !patron.includes('*')
    ? `${req.baseUrl}${patron}`
    : '(sin ruta)'
}

// OBS-01. Primero de la cadena: asigna el requestId (el entrante solo si es
// válido), lo devuelve en X-Request-Id y deja una línea de acceso al terminar
// la respuesta. Corre todo lo demás dentro del contexto de la solicitud.
export function registroDeSolicitudes() {
  return (req: Request, res: Response, next: NextFunction) => {
    const requestId = requestIdDe(req.headers[HEADER_REQUEST_ID])
    res.setHeader('X-Request-Id', requestId)
    const inicio = process.hrtime.bigint()
    contextoSolicitud.run({ requestId }, () => {
      res.on('finish', () => {
        const status = res.statusCode
        const sub = (req as Request & { usuario?: { sub?: unknown } }).usuario
          ?.sub
        const linea = {
          message: 'solicitud atendida',
          method: req.method,
          route: rutaDe(req),
          status,
          durationMs: Number(process.hrtime.bigint() - inicio) / 1e6,
          // Solo el id interno, y solo si la solicitud ya está autenticada.
          ...(typeof sub === 'string' && ES_UUID.test(sub)
            ? { usuarioId: sub }
            : {}),
        }
        const ruta = linea.route
        if (SALUD.test(ruta) && status < 400) {
          logger.debug(linea)
        } else if (status >= 500) logger.error(linea)
        else if (status >= 400) logger.warn(linea)
        else logger.log(linea)
      })
      next()
    })
  }
}
