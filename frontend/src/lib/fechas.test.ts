import { describe, expect, test } from 'vitest'
import { formatearFecha, formatearFechaHora, tiempoRestante } from './fechas'

describe('formatearFecha', () => {
  test('da día-mes-año con ceros, como se escribe en Chile', () => {
    expect(formatearFecha(new Date(2026, 10, 4))).toBe('04-11-2026')
    expect(formatearFecha(new Date(2026, 0, 31))).toBe('31-01-2026')
  })

  test('un texto de solo fecha es un día del calendario: la zona horaria no lo corre', () => {
    expect(formatearFecha('2026-11-14')).toBe('14-11-2026')
    expect(formatearFecha('2026-01-01')).toBe('01-01-2026')
  })

  test('acepta un texto con hora, un Date y un número', () => {
    expect(formatearFecha('2026-11-14T15:30:00')).toBe('14-11-2026')
    expect(formatearFecha(new Date(2026, 5, 9, 23, 59).getTime())).toBe(
      '09-06-2026',
    )
  })

  test.each([null, undefined, '', 'no es una fecha', NaN])(
    'sin valor o con un valor inválido (%s) devuelve «—»',
    (valor) => {
      expect(formatearFecha(valor as string)).toBe('—')
    },
  )
})

describe('formatearFechaHora', () => {
  test('agrega la hora de 24 horas, sin coma', () => {
    expect(formatearFechaHora(new Date(2026, 10, 14, 15, 30))).toBe(
      '14-11-2026 15:30',
    )
    expect(formatearFechaHora(new Date(2026, 10, 4, 9, 5))).toBe(
      '04-11-2026 09:05',
    )
    expect(formatearFechaHora(new Date(2026, 10, 4, 0, 0))).toBe(
      '04-11-2026 00:00',
    )
  })

  test('acepta el texto que entrega la API', () => {
    expect(formatearFechaHora('2026-11-14T08:45:00')).toBe('14-11-2026 08:45')
  })

  test.each([null, undefined, '', 'nunca'])(
    'sin valor o inválido (%s) devuelve «—»',
    (valor) => {
      expect(formatearFechaHora(valor as string)).toBe('—')
    },
  )
})

describe('tiempoRestante', () => {
  const ahora = new Date('2026-11-16T12:00:00Z').getTime()
  const en = (ms: number) => new Date(ahora + ms).toISOString()
  const HORA = 3_600_000

  test.each([
    [6.5 * 24 * HORA, 'Vence en 6 días', false],
    [24 * HORA, 'Vence en 1 día', false],
    [23 * HORA, 'Vence en 23 horas', true],
    [HORA, 'Vence en 1 hora', true],
    [10 * 60_000, 'Vence en 10 minutos', true],
    [-2 * 24 * HORA, 'Venció hace 2 días', true],
    [-3 * HORA, 'Venció hace 3 horas', true],
    [-1000, 'Venció hace 1 minuto', true],
  ])('%i ms → %s', (ms, texto, urgente) => {
    expect(tiempoRestante(en(ms), ahora)).toEqual({ texto, urgente })
  })

  test('sin fecha válida no hay texto', () => {
    expect(tiempoRestante(null, ahora)).toBeNull()
    expect(tiempoRestante('no es fecha', ahora)).toBeNull()
  })
})
