import { isIP } from 'node:net'
import { BadRequestException } from '@nestjs/common'
import type { Request } from 'express'

export const ORIGEN_VERIFICADO = Symbol('origen-verificado')
export type RequestLogin = Request & { [ORIGEN_VERIFICADO]?: true }

export function normalizarIp(valor: string): string | null {
  if (isIP(valor) === 4) return valor
  if (isIP(valor) !== 6 || valor.includes('%')) return null
  const ip = new URL(`http://[${valor}]`).hostname.slice(1, -1)
  const mapeada = /^::ffff:([a-f0-9]+):([a-f0-9]+)$/.exec(ip)
  if (!mapeada) return ip
  const alto = parseInt(mapeada[1], 16)
  const bajo = parseInt(mapeada[2], 16)
  return [alto >> 8, alto & 255, bajo >> 8, bajo & 255].join('.')
}

// En local solo cuenta el socket. Con origen verificado se exige la IP de
// Vercel, incluso si el endpoint se pidió con mayúsculas o barra final.
export function ipLogin(req: RequestLogin): string {
  if (req[ORIGEN_VERIFICADO]) {
    const cabecera = req.headers['x-vercel-forwarded-for']
    const ip = typeof cabecera === 'string' && normalizarIp(cabecera.trim())
    if (!ip) throw new BadRequestException('IP de origen inválida')
    return ip
  }
  return normalizarIp(req.socket.remoteAddress ?? '') ?? 'desconocida'
}
