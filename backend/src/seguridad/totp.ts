import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { DIGITOS_CODIGO_MFA } from '@cursus/shared'

// SEG-01. Códigos TOTP (RFC 6238) con los parámetros que leen Google
// Authenticator y Authy: HMAC-SHA1, 6 dígitos y pasos de 30 segundos. Se
// implementa con node:crypto para no sumar una dependencia por ~50 líneas.

export const SEGUNDOS_POR_PASO = 30
// Pasos de tolerancia hacia atrás y hacia adelante, por si el reloj del
// teléfono está algo corrido (±30 segundos).
export const PASOS_DE_TOLERANCIA = 1
// 20 bytes (160 bits): el largo que recomienda la RFC 4226 para HMAC-SHA1.
const BYTES_SECRETO = 20
const ALFABETO_BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
export const EMISOR_TOTP = 'CURSUS'

// Base32 de la RFC 4648, sin relleno: es lo que esperan las apps en la uri.
export function aBase32(bytes: Buffer): string {
  let bits = 0
  let valor = 0
  let texto = ''
  for (const byte of bytes) {
    valor = (valor << 8) | byte
    bits += 8
    while (bits >= 5) {
      texto += ALFABETO_BASE32[(valor >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) {
    texto += ALFABETO_BASE32[(valor << (5 - bits)) & 31]
  }
  return texto
}

// Acepta minúsculas, espacios y relleno, como lo escribiría una persona.
export function desdeBase32(texto: string): Buffer {
  const limpio = texto.toUpperCase().replace(/[\s=]/g, '')
  let bits = 0
  let valor = 0
  const bytes: number[] = []
  for (const caracter of limpio) {
    const indice = ALFABETO_BASE32.indexOf(caracter)
    if (indice < 0) {
      throw new Error('Secreto base32 inválido')
    }
    valor = (valor << 5) | indice
    bits += 5
    if (bits >= 8) {
      bytes.push((valor >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

export function generarSecretoTotp(): string {
  return aBase32(randomBytes(BYTES_SECRETO))
}

// Código HOTP (RFC 4226) para un contador.
function codigoParaPaso(secreto: Buffer, paso: number): string {
  const contador = Buffer.alloc(8)
  contador.writeBigUInt64BE(BigInt(paso))
  const hmac = createHmac('sha1', secreto).update(contador).digest()
  const desplazamiento = hmac[hmac.length - 1] & 0x0f
  const numero = hmac.readUInt32BE(desplazamiento) & 0x7fffffff
  return (numero % 10 ** DIGITOS_CODIGO_MFA)
    .toString()
    .padStart(DIGITOS_CODIGO_MFA, '0')
}

export const pasoDe = (instante: number) =>
  Math.floor(instante / 1000 / SEGUNDOS_POR_PASO)

export function codigoTotp(secreto: string, instante = Date.now()): string {
  return codigoParaPaso(desdeBase32(secreto), pasoDe(instante))
}

// Devuelve el paso al que corresponde el código, o null si no es válido en
// la ventana de tolerancia. SEG-02 puede guardar el paso para no aceptar el
// mismo código dos veces. Revisa todos los pasos y compara en tiempo
// constante, para que la respuesta no dependa de en cuál calzó.
export function pasoDelCodigo(
  secreto: string,
  codigo: string,
  instante = Date.now(),
): number | null {
  if (!new RegExp(`^\\d{${DIGITOS_CODIGO_MFA}}$`).test(codigo)) {
    return null
  }
  const clave = desdeBase32(secreto)
  const actual = pasoDe(instante)
  let encontrado: number | null = null
  for (
    let delta = -PASOS_DE_TOLERANCIA;
    delta <= PASOS_DE_TOLERANCIA;
    delta++
  ) {
    const paso = actual + delta
    const esperado = Buffer.from(codigoParaPaso(clave, paso))
    if (timingSafeEqual(esperado, Buffer.from(codigo)) && encontrado === null) {
      encontrado = paso
    }
  }
  return encontrado
}

// otpauth://totp/CURSUS:correo?secret=...&issuer=CURSUS, el formato de Key
// Uri que leen las apps autenticadoras. El emisor va también en la etiqueta
// para las apps que no leen el parámetro issuer.
export function uriTotp(cuenta: string, secreto: string): string {
  const etiqueta = `${encodeURIComponent(EMISOR_TOTP)}:${encodeURIComponent(cuenta)}`
  const parametros = new URLSearchParams({
    secret: secreto,
    issuer: EMISOR_TOTP,
    algorithm: 'SHA1',
    digits: String(DIGITOS_CODIGO_MFA),
    period: String(SEGUNDOS_POR_PASO),
  })
  return `otpauth://totp/${etiqueta}?${parametros.toString()}`
}
