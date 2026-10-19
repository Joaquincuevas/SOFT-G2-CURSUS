import { createHash, timingSafeEqual } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'
import { ORIGEN_VERIFICADO, type RequestLogin } from '../auth/ip-login.js'

export const PREFIJO_API = 'api'
export const HEADER_SECRETO = 'x-origin-secret'

// /api/health lo llama el health check del contenedor desde localhost, sin
// pasar por Vercel, así que no exige el header secreto.
const RUTAS_SIN_SECRETO = new Set([`/${PREFIJO_API}/health`])

interface OpcionesApp {
  secretoOrigen?: string
}

// Configuración común de la app, usada por main.ts y por los tests.
export function configurarApp(
  app: INestApplication,
  { secretoOrigen = process.env.ORIGIN_SECRET }: OpcionesApp = {},
): void {
  app.setGlobalPrefix(PREFIJO_API)
  app.use(sinCache)
  if (secretoOrigen) {
    app.use(exigirSecretoOrigen(secretoOrigen))
  }
}

// Ninguna respuesta de la API se guarda en cachés intermedias (Vercel, navegador).
function sinCache(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('Cache-Control', 'no-store')
  next()
}

// Vercel agrega el header secreto al reenviar /api/*; las peticiones que llegan
// directo a API Gateway sin él se rechazan.
function exigirSecretoOrigen(secreto: string) {
  const esperado = resumen(secreto)
  return (req: RequestLogin, res: Response, next: NextFunction) => {
    if (RUTAS_SIN_SECRETO.has(req.path)) {
      return next()
    }
    const recibido = req.headers[HEADER_SECRETO]
    if (
      typeof recibido !== 'string' ||
      !timingSafeEqual(resumen(recibido), esperado)
    ) {
      res.status(403).json({ statusCode: 403, message: 'Forbidden' })
      return
    }
    req[ORIGEN_VERIFICADO] = true
    next()
  }
}

// Se comparan resúmenes de igual largo para que timingSafeEqual no dependa del
// largo del valor recibido.
function resumen(valor: string): Buffer {
  return createHash('sha256').update(valor).digest()
}
