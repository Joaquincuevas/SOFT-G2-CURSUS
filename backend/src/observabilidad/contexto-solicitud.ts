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

// X-Request-Id entrante: solo se respeta si es una cadena corta de caracteres
// inocuos. Un valor con saltos de línea, comillas, espacios o muy largo no
// llega al log (es la puerta a la inyección de líneas): se genera uno nuevo.
const FORMATO_REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/

export function requestIdDe(entrante: unknown): string {
  return typeof entrante === 'string' && FORMATO_REQUEST_ID.test(entrante)
    ? entrante
    : randomUUID()
}

export const requestIdActual = () => contextoSolicitud.getStore()?.requestId
