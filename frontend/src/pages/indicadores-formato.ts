import { useSearchParams } from 'react-router'

// Lo que comparten el Dashboard del Director y las pantallas de Indicadores
// (MET-01 a MET-07) y no es un componente.
export const SIN_DATOS = 'Sin datos suficientes'

export const plural = (n: number, nombre: string) =>
  `${n} ${nombre}${n === 1 ? '' : 's'}`

// Un indicador sin valor no tiene denominador: se dice, en vez de mostrar 0.
export function valorIndicador(
  valor: number | null,
  decimales: number,
  unidad = '',
) {
  return valor === null
    ? SIN_DATOS
    : `${valor.toLocaleString('es-CL', { minimumFractionDigits: decimales, maximumFractionDigits: decimales })}${unidad}`
}

// El período se conserva en la URL (?periodo=AAAA-S). Sin él, es el período
// activo. Un valor que no tiene la forma AAAA-S no se envía: se avisa (valido
// = false).
const FORMATO_PERIODO = /^\d{4}-[12]$/

export function usePeriodoDeLaUrl() {
  const [params] = useSearchParams()
  const periodo = params.get('periodo')
  const consulta = periodo ? `?periodo=${encodeURIComponent(periodo)}` : ''
  const valido = periodo === null || FORMATO_PERIODO.test(periodo)
  return { periodo, valido, consulta, sufijo: consulta }
}

// Enlace de texto de estas pantallas: la app no trae estilo de enlaces
// (Tailwind sin preflight). Color de la marca, sin subrayado fijo (solo al
// pasar el mouse) y foco visible con el teclado.
export const ENLACE =
  'rounded-sm font-medium text-primary no-underline underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'

// Nombre de un paso del breadcrumb que sale de una consulta: null mientras está
// pendiente (el encabezado dibuja un esqueleto); si falló o la URL no la
// permite (un período inválido no la pide), una etiqueta de respaldo.
export function nombrePaso<T>(
  datos: T | null | undefined,
  valido: boolean,
  respaldo: string,
  nombre: (datos: T) => string,
): string | null {
  if (!valido || datos === null) return respaldo
  return datos === undefined ? null : nombre(datos)
}
