import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from 'node:crypto'

// SEG-01. El secreto TOTP se guarda cifrado con AES-256-GCM. La llave se
// deriva con HKDF de MFA_SECRET, que en AWS genera Secrets Manager y nunca se
// guarda en la base: quien obtenga un respaldo de la base no puede generar
// códigos. El id del usuario va como dato autenticado, así que un secreto
// copiado a la fila de otro usuario no se descifra.
//
// Formato: v1.<iv>.<tag>.<cifrado>, cada parte en base64url. El prefijo
// permite cambiar el esquema más adelante sin perder los secretos guardados.

const VERSION = 'v1'
const BYTES_IV = 12
const INFO_HKDF = 'cursus/seg-01/secreto-totp'

export function llaveMfa(secreto: string): Buffer {
  return Buffer.from(hkdfSync('sha256', secreto, '', INFO_HKDF, 32))
}

export function cifrarSecretoTotp(
  llave: Buffer,
  usuarioId: string,
  secretoTotp: string,
): string {
  const iv = randomBytes(BYTES_IV)
  const cifrador = createCipheriv('aes-256-gcm', llave, iv)
  cifrador.setAAD(Buffer.from(usuarioId))
  const cifrado = Buffer.concat([
    cifrador.update(secretoTotp, 'utf8'),
    cifrador.final(),
  ])
  return [VERSION, iv, cifrador.getAuthTag(), cifrado]
    .map((parte) =>
      typeof parte === 'string' ? parte : parte.toString('base64url'),
    )
    .join('.')
}

// Lanza si el texto fue alterado, es de otro usuario o se cifró con otra
// llave.
export function descifrarSecretoTotp(
  llave: Buffer,
  usuarioId: string,
  guardado: string,
): string {
  const [version, iv, tag, cifrado, ...resto] = guardado.split('.')
  if (version !== VERSION || !iv || !tag || !cifrado || resto.length > 0) {
    throw new Error('Formato de secreto TOTP desconocido')
  }
  const descifrador = createDecipheriv(
    'aes-256-gcm',
    llave,
    Buffer.from(iv, 'base64url'),
  )
  descifrador.setAAD(Buffer.from(usuarioId))
  descifrador.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([
    descifrador.update(Buffer.from(cifrado, 'base64url')),
    descifrador.final(),
  ]).toString('utf8')
}
