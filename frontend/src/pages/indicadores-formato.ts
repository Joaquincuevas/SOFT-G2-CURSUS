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
// (Tailwind sin preflight), así que va con el color de la marca y subrayado.
export const ENLACE =
  'rounded-sm font-medium text-primary underline underline-offset-4 hover:text-(color:--color-primary-dark) focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'
