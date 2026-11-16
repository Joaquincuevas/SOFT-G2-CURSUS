import { describe, expect, test } from 'vitest'
import {
  enZona,
  fechasLegibles,
  horaMinima,
  textoPeriodoTerminado,
  validarPlazo,
  ventanaActividad,
} from './ventanaActividad'

// Instantes en UTC; Chile continental está en UTC-3 en noviembre (horario de
// verano) y en UTC-4 en junio.
const NOV_15_1030 = new Date('2026-11-15T13:30:00Z') // 15-11-2026 10:30 en Santiago
const PERIODO_2 = { fechaInicio: '2026-08-03', fechaTermino: '2026-12-18' }
const PERIODO_1 = { fechaInicio: '2026-03-02', fechaTermino: '2026-06-30' }

describe('ventana de la fecha límite (regla del backend)', () => {
  test('lee la fecha y la hora en la zona de la universidad, no en UTC', () => {
    // 02:30 UTC del 16 es todavía el 15 en Santiago.
    expect(enZona(new Date('2026-11-16T02:30:00Z'))).toEqual({
      fecha: '2026-11-15',
      hora: '23:30',
    })
  })

  test('período vigente: desde hoy hasta el fin del período', () => {
    expect(ventanaActividad(PERIODO_2, NOV_15_1030)).toEqual({
      desde: '2026-11-15',
      hasta: '2026-12-18',
    })
  })

  test('período que aún no empieza: desde su primer día', () => {
    expect(
      ventanaActividad(
        { fechaInicio: '2027-03-01', fechaTermino: '2027-07-10' },
        NOV_15_1030,
      ),
    ).toEqual({ desde: '2027-03-01', hasta: '2027-07-10' })
  })

  test('período terminado: no queda ningún día', () => {
    expect(ventanaActividad(PERIODO_1, NOV_15_1030)).toBeNull()
    expect(
      textoPeriodoTerminado({ ...PERIODO_1, anio: 2026, semestre: 1 }),
    ).toBe(
      'El período 2026-1 terminó el 30-06-2026. No se pueden crear actividades nuevas en este curso.',
    )
  })

  test('el último día del período sirve mientras quede algún minuto', () => {
    const ultimoDia = new Date('2026-12-18T20:00:00Z') // 17:00 en Santiago
    expect(ventanaActividad(PERIODO_2, ultimoDia)).toEqual({
      desde: '2026-12-18',
      hasta: '2026-12-18',
    })
    const ultimoMinuto = new Date('2026-12-19T02:59:30Z') // 23:59 del 18
    expect(ventanaActividad(PERIODO_2, ultimoMinuto)).toBeNull()
  })

  test('mismo día: la hora mínima es el minuto siguiente al actual', () => {
    expect(horaMinima('2026-11-15', NOV_15_1030)).toBe('10:31')
    expect(horaMinima('2026-11-16', NOV_15_1030)).toBe('00:00')
  })
})

describe('validación del plazo: un error por campo', () => {
  const ventana = ventanaActividad(PERIODO_2, NOV_15_1030)

  test('sin fecha pide la fecha y no opina de la hora', () => {
    expect(validarPlazo('', '', ventana, NOV_15_1030)).toEqual({
      fecha: 'Elige la fecha límite.',
    })
  })

  test('una fecha fuera de la ventana dice el rango en dd-mm-aaaa', () => {
    expect(validarPlazo('2026-12-20', '10:00', ventana, NOV_15_1030)).toEqual({
      fecha: 'La fecha límite debe estar entre el 15-11-2026 y el 18-12-2026.',
    })
    expect(validarPlazo('2026-11-14', '10:00', ventana, NOV_15_1030)).toEqual({
      fecha: 'La fecha límite debe estar entre el 15-11-2026 y el 18-12-2026.',
    })
  })

  test('hoy, una hora que ya pasó no sirve; la siguiente sí', () => {
    expect(validarPlazo('2026-11-15', '10:30', ventana, NOV_15_1030)).toEqual({
      hora: 'Para hoy, la hora límite debe ser desde las 10:31.',
    })
    expect(validarPlazo('2026-11-15', '10:31', ventana, NOV_15_1030)).toEqual(
      {},
    )
  })

  test('otro día dentro de la ventana acepta cualquier hora', () => {
    expect(validarPlazo('2026-12-18', '00:00', ventana, NOV_15_1030)).toEqual(
      {},
    )
  })

  test('sin hora la pide', () => {
    expect(validarPlazo('2026-11-20', '', ventana, NOV_15_1030)).toEqual({
      hora: 'Elige la hora límite.',
    })
  })
})

test('los mensajes del servidor muestran las fechas en dd-mm-aaaa', () => {
  expect(
    fechasLegibles(
      'La fecha límite debe estar dentro del período del curso (del 2026-08-03 al 2026-12-18)',
    ),
  ).toBe(
    'La fecha límite debe estar dentro del período del curso (del 03-08-2026 al 18-12-2026)',
  )
})
