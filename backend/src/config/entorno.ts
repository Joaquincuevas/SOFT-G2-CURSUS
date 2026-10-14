// Variables obligatorias en producción. En local se usan los valores por
// defecto de data-source.ts y la validación del header secreto se desactiva.
export const VARIABLES_BASE_DE_DATOS = [
  'POSTGRES_HOST',
  'POSTGRES_USER',
  'POSTGRES_PASSWORD',
  'POSTGRES_DB',
]

export const VARIABLES_API = [...VARIABLES_BASE_DE_DATOS, 'ORIGIN_SECRET']

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
}
