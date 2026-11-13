import { createHmac } from 'node:crypto'
import type { JwtService } from '@nestjs/jwt'
import { secretoJwt } from '../config/entorno.js'

// SEG-02. Desafío del paso 1 del login con MFA: lo que se entrega en vez de
// una sesión cuando la contraseña es correcta y la cuenta tiene MFA activo.
//
// - No sirve como token de sesión: se firma con una llave derivada de
//   JWT_SECRET con otro propósito, así que JwtAuthGuard, que verifica con
//   JWT_SECRET, lo rechaza. Tampoco trae rol, universidad ni sid. Y al
//   revés: un JWT de sesión no pasa como desafío.
// - Expira en 5 minutos.
// - De un solo uso: lleva el último paso TOTP aceptado de la cuenta cuando se
//   emitió (up). Al iniciar sesión con él, ese paso avanza, y el mismo
//   desafío deja de valer aunque llegue con un código nuevo.
// - Vinculado a la versión de la credencial (cv): una huella del hash de la
//   contraseña de la cuenta. Cambiar o restablecer la contraseña genera otro
//   hash, así que un desafío emitido antes ya no sirve, aunque no haya expirado
//   ni se haya usado.
export const DURACION_DESAFIO_MFA = '5m'
const PROPOSITO = 'mfa'

export interface DesafioMfa {
  usuarioId: string
  // Último paso aceptado al emitirlo; null si la cuenta aún no usa ninguno.
  ultimoPaso: number | null
  // Huella de la credencial (huellaCredencial) cuando se emitió.
  credencial: string
}

const llaveDelDesafio = () =>
  createHmac('sha256', secretoJwt()).update('cursus:desafio-mfa:v1').digest()

// Versión de la credencial: HMAC (con la llave del desafío) del hash de la
// contraseña, para no poner el hash en un token que ve el cliente. Un hash
// nuevo, aunque sea de la misma contraseña, da otra huella (sal distinta).
export const huellaCredencial = (passwordHash: string) =>
  createHmac('sha256', llaveDelDesafio())
    .update(passwordHash)
    .digest('base64url')
    .slice(0, 22)

export function firmarDesafioMfa(
  jwt: JwtService,
  { usuarioId, ultimoPaso, credencial }: DesafioMfa,
  expiresIn: string = DURACION_DESAFIO_MFA,
): Promise<string> {
  return jwt.signAsync(
    { sub: usuarioId, prop: PROPOSITO, up: ultimoPaso, cv: credencial },
    { secret: llaveDelDesafio(), expiresIn: expiresIn as never },
  )
}

// null si el desafío no es válido: manipulado, expirado, de otro propósito o
// firmado con la llave de sesión.
export async function leerDesafioMfa(
  jwt: JwtService,
  token: string,
): Promise<DesafioMfa | null> {
  try {
    const payload = await jwt.verifyAsync<{
      sub?: unknown
      prop?: unknown
      up?: unknown
      cv?: unknown
    }>(token, { secret: llaveDelDesafio() })
    const { sub, prop, up, cv } = payload
    if (
      prop !== PROPOSITO ||
      typeof sub !== 'string' ||
      typeof cv !== 'string' ||
      !(up === null || (Number.isInteger(up) && (up as number) >= 0))
    ) {
      return null
    }
    return { usuarioId: sub, ultimoPaso: up as number | null, credencial: cv }
  } catch {
    return null
  }
}
