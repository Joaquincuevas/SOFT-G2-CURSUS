// Variables obligatorias en producción. En local se usan los valores por
// defecto de data-source.ts y la validación del header secreto se desactiva.
export const VARIABLES_BASE_DE_DATOS = [
  'POSTGRES_HOST',
  'POSTGRES_USER',
  'POSTGRES_PASSWORD',
  'POSTGRES_DB',
]

export const VARIABLES_API = [
  ...VARIABLES_BASE_DE_DATOS,
  'ORIGIN_SECRET',
  'JWT_SECRET',
]

// Un secreto JWT corto se puede adivinar por fuerza bruta a partir de un token.
export const LARGO_MINIMO_SECRETO_JWT = 32

// Falla al arrancar si falta alguna variable, para no caer en silencio en
// localhost. El mensaje nombra las variables, nunca sus valores.
export function validarEntorno(
  nombres: string[],
  entorno: NodeJS.ProcessEnv = process.env,
): void {
  if (entorno.NODE_ENV !== 'production') {
    return
  }
  const faltantes = nombres.filter((nombre) => !entorno[nombre])
  if (faltantes.length > 0) {
    throw new Error(
      `Faltan variables de entorno obligatorias: ${faltantes.join(', ')}`,
    )
  }
  if (nombres.includes('JWT_SECRET')) {
    secretoJwt(entorno)
  }
}

// El backend no firma tokens sin un secreto válido, en ningún entorno. En local
// el valor viene de .env (ver .env.example).
export function secretoJwt(entorno: NodeJS.ProcessEnv = process.env): string {
  const secreto = entorno.JWT_SECRET
  if (!secreto || secreto.length < LARGO_MINIMO_SECRETO_JWT) {
    throw new Error(
      `JWT_SECRET debe tener al menos ${LARGO_MINIMO_SECRETO_JWT} caracteres`,
    )
  }
  return secreto
}

// Duración del JWT de sesión, en el formato de jsonwebtoken (por ejemplo, 15m).
export function duracionJwt(entorno: NodeJS.ProcessEnv = process.env): string {
  return entorno.JWT_EXPIRES_IN || '15m'
}

const SEGUNDOS_POR_UNIDAD = { s: 1, m: 60, h: 3600, d: 86400 }

// Duración del refresh token en segundos. JWT_REFRESH_EXPIRES_IN acepta un
// número y una unidad (30m, 12h, 7d); por defecto, 7 días.
export function duracionRefresh(
  entorno: NodeJS.ProcessEnv = process.env,
): number {
  const valor = entorno.JWT_REFRESH_EXPIRES_IN || '7d'
  const partes = /^([1-9]\d*)([smhd])$/.exec(valor)
  if (!partes) {
    throw new Error(
      'JWT_REFRESH_EXPIRES_IN debe ser un número y una unidad (s, m, h o d), por ejemplo 7d',
    )
  }
  const unidad = partes[2] as keyof typeof SEGUNDOS_POR_UNIDAD
  return Number(partes[1]) * SEGUNDOS_POR_UNIDAD[unidad]
}
