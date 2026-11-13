// OBS-01. Redacción central: todo lo que se escribe en el log pasa por aquí
// antes de salir, también los mensajes y stacks de los errores. Es una lista de
// lo que no debe llegar a CloudWatch: contraseñas, tokens (JWT, refresh,
// enlaces de recuperación, desafío MFA), códigos TOTP, secretos, cabeceras
// Authorization y Cookie, RUT y correos. Prefiere redactar de más.
export const REDACTADO = '[REDACTADO]'

const PROFUNDIDAD_MAXIMA = 8

// Claves sensibles. Las cortas (rut, otp, jwt, code) deben coincidir con la
// clave completa, para no tocar "route" ni "outputs"; las largas, con
// cualquier parte de ella (passwordNueva, x-refresh-token, correoAlumno).
const CLAVES_EXACTAS = new Set(['rut', 'otp', 'totp', 'jwt', 'code', 'pin'])
const CLAVES_PARCIALES = [
  'password',
  'passwd',
  'contrasena',
  'token',
  'authorization',
  'cookie',
  'secret',
  'secreto',
  'desafio',
  'codigo',
  'credencial',
  'clave',
  'llave',
  'apikey',
  'bearer',
  'hash',
  'signature',
  'firma',
  'refresh',
  'correo',
  'email',
  'mail',
]

export function esClaveSensible(clave: string): boolean {
  const normal = clave
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
  return (
    CLAVES_EXACTAS.has(normal) ||
    // "rut" dentro de rutAlumno, pero no de "route" o "ruta": se mira el
    // nombre original por palabras.
    clave
      .split(/[^A-Za-z0-9]+|(?<=[a-z])(?=[A-Z])/)
      .some((palabra) => CLAVES_EXACTAS.has(palabra.toLowerCase())) ||
    CLAVES_PARCIALES.some((parte) => normal.includes(parte))
  )
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PALABRAS_SENSIBLES =
  'password(?:nueva|actual)?|contrase(?:ñ|n)a|token|secret|authorization|cookie|set-cookie|desafio|c[oó]digo|code|otp|totp|clave|refresh|rut|correo|email'

// Cada patrón se aplica sobre todo texto. Van de lo más específico a lo más
// general.
const PATRONES: [RegExp, string | ((...partes: string[]) => string)][] = [
  // JWT: tres partes en base64url, la primera es {"alg"...} = eyJ.
  [/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g, REDACTADO],
  // Authorization: Bearer xxx / Basic xxx.
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{6,}/gi, `$1 ${REDACTADO}`],
  // clave=valor, clave: valor y "clave":"valor" (query, JSON, cabeceras).
  [
    new RegExp(
      `(["']?\\b(?:${PALABRAS_SENSIBLES})["']?\\s*[:=]\\s*)("[^"]*"|'[^']*'|[^\\s,;&#"'}\\]]+)`,
      'gi',
    ),
    `$1${REDACTADO}`,
  ],
  // "código 123456", "TOTP: 123456": el código suelto junto a su palabra.
  [
    /\b(c[oó]digo|code|otp|totp)\b[^\d\n]{0,20}\b\d{6,8}\b/gi,
    `$1 ${REDACTADO}`,
  ],
  // Enlace de recuperación: el token va en el fragmento (#token).
  [/#[A-Za-z0-9_-]{16,}/g, `#${REDACTADO}`],
  // Correos.
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g, REDACTADO],
  // RUT chileno: 12.345.678-5, 12345678-5, 12.345.678K y 123456785 (9 dígitos
  // con el dígito verificador pegado).
  [/\b\d{1,2}\.\d{3}\.\d{3}\s?-?\s?[\dkK]\b/g, REDACTADO],
  [/\b\d{7,8}\s?-\s?[\dkK]\b/g, REDACTADO],
  [/\b\d{7,8}[\dkK]\b/g, REDACTADO],
]

// Textos opacos largos (refresh tokens, hashes, claves): base64url de 32
// caracteres o más que no sea un UUID.
const OPACO = /[A-Za-z0-9_-]{32,}/g

export function redactarTexto(texto: string): string {
  let salida = texto
  for (const [patron, reemplazo] of PATRONES) {
    salida = salida.replace(patron, reemplazo as string)
  }
  return salida.replace(OPACO, (parte) =>
    UUID.test(parte) ? parte : REDACTADO,
  )
}

// Redacta cualquier valor: textos por patrón, objetos por clave, errores por
// nombre, mensaje y stack. No toca los números ni los booleanos.
export function redactar(
  valor: unknown,
  profundidad = 0,
  vistos = new WeakSet<object>(),
): unknown {
  if (typeof valor === 'string') return redactarTexto(valor)
  if (valor === null || valor === undefined) return valor
  if (typeof valor === 'number' || typeof valor === 'boolean') return valor
  if (typeof valor === 'bigint') return valor.toString()
  if (typeof valor === 'function' || typeof valor === 'symbol') return undefined
  if (valor instanceof Date) return valor.toISOString()
  if (profundidad >= PROFUNDIDAD_MAXIMA) return '[PROFUNDO]'
  if (typeof valor === 'object') {
    if (vistos.has(valor)) return '[CIRCULAR]'
    vistos.add(valor)
    if (Buffer.isBuffer(valor)) return `[Buffer ${valor.length} bytes]`
    if (valor instanceof Error) {
      // Solo nombre, mensaje y stack: nunca las demás propiedades del error
      // (TypeORM adjunta la consulta y sus parámetros).
      return {
        name: valor.name,
        message: redactarTexto(valor.message),
        ...(valor.stack ? { stack: redactarTexto(valor.stack) } : {}),
      }
    }
    if (Array.isArray(valor)) {
      return valor.map((v) => redactar(v, profundidad + 1, vistos))
    }
    return Object.fromEntries(
      Object.entries(valor).map(([clave, v]) => [
        clave,
        esClaveSensible(clave)
          ? REDACTADO
          : redactar(v, profundidad + 1, vistos),
      ]),
    )
  }
  return undefined
}
