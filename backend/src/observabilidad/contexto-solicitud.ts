import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'

// OBS-01. Lo que cada línea de log necesita de la solicitud en curso. Vive en
// un AsyncLocalStorage: cualquier Logger, en cualquier servicio, lo lee sin
// recibirlo por parámetro.
export interface ContextoSolicitud {
  requestId: string
}

export const contextoSolicitud = new AsyncLocalStorage<ContextoSolicitud>()

export const HEADER_REQUEST_ID = 'x-request-id'

// El requestId lo genera siempre la API (un UUID). El X-Request-Id que manda
// el cliente se ignora: un valor que cumpla un formato "inocuo" igual podría
// ser un dato sensible (un token, un RUT sin puntos) y terminaría escrito en el
// log. Si algún día hay un proxy propio que fije el id, habrá que aceptarlo solo
// de ese proxy, verificado como el secreto de origen, y no del cliente.
export const nuevoRequestId = (): string => randomUUID()

export const requestIdActual = () => contextoSolicitud.getStore()?.requestId
