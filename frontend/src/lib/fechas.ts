// Fechas y horas en español de Chile (es-CL), con Intl. Las dos funciones
// aceptan lo que entrega la API (texto ISO), un Date o un número, y devuelven
// «—» si no hay valor o no es una fecha válida.
const SIN_FECHA = '—'

const SOLO_FECHA = new Intl.DateTimeFormat('es-CL', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})
const FECHA_Y_HORA = new Intl.DateTimeFormat('es-CL', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

type Valor = Date | string | number | null | undefined

function aFecha(valor: Valor): Date | null {
  if (valor === null || valor === undefined || valor === '') return null
  // «2026-11-14» es un día del calendario, no un instante: se lee como fecha
  // local para que la zona horaria no lo corra al día anterior.
  const dia =
    typeof valor === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor)
  const fecha = dia
    ? new Date(Number(dia[1]), Number(dia[2]) - 1, Number(dia[3]))
    : new Date(valor)
  return Number.isNaN(fecha.getTime()) ? null : fecha
}

// 14-11-2026
export function formatearFecha(valor: Valor): string {
  const fecha = aFecha(valor)
  return fecha ? SOLO_FECHA.format(fecha) : SIN_FECHA
}

// 14-11-2026 15:30, en la zona horaria del navegador.
export function formatearFechaHora(valor: Valor): string {
  const fecha = aFecha(valor)
  return fecha ? FECHA_Y_HORA.format(fecha).replace(',', '') : SIN_FECHA
}
