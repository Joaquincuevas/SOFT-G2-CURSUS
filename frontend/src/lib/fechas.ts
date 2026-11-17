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

const MINUTO = 60_000
const HORA = 60 * MINUTO
const DIA = 24 * HORA
const plural = (n: number, singular: string, plural: string) =>
  `${n} ${n === 1 ? singular : plural}`

// Cuánto falta para un plazo: «Vence en 6 días», «Vence en 5 horas» o, si ya
// pasó, «Venció hace 2 días». `urgente` es true si faltan menos de 24 horas o
// ya venció. `ahora` se pasa para no leer el reloj en cada render.
export function tiempoRestante(
  plazo: Valor,
  ahora: number,
): { texto: string; urgente: boolean } | null {
  const fecha = aFecha(plazo)
  if (!fecha) return null
  const diferencia = fecha.getTime() - ahora
  const abs = Math.abs(diferencia)
  const medida =
    abs >= DIA
      ? plural(Math.floor(abs / DIA), 'día', 'días')
      : abs >= HORA
        ? plural(Math.floor(abs / HORA), 'hora', 'horas')
        : plural(Math.max(1, Math.floor(abs / MINUTO)), 'minuto', 'minutos')
  return diferencia <= 0
    ? { texto: `Venció hace ${medida}`, urgente: true }
    : { texto: `Vence en ${medida}`, urgente: diferencia < DIA }
}
