import { describe, expect, it } from 'vitest'
import { calcularNotaFinal } from './nota-final.js'

describe('calcularNotaFinal (NOT-14)', () => {
  it('con todas las notas publicadas y 100 % es la nota FINAL ponderada', () => {
    expect(
      calcularNotaFinal([
        { ponderacion: 30, nota: 4 },
        { ponderacion: 30, nota: 5 },
        { ponderacion: 40, nota: 6 },
      ]),
    ).toEqual({ tipo: 'FINAL', nota: 5.1, porcentajeEvaluado: 100 })
  })

  it('redondea a un decimal, la mitad hacia arriba', () => {
    // 5,05 exacto: en punto flotante 5.05 * 10 no da 50.5.
    expect(
      calcularNotaFinal([
        { ponderacion: 50, nota: 5 },
        { ponderacion: 50, nota: 5.1 },
      ]).nota,
    ).toBe(5.1)
    // 4,04 → 4,0 y 4,06 → 4,1.
    expect(
      calcularNotaFinal([
        { ponderacion: 60, nota: 4 },
        { ponderacion: 40, nota: 4.1 },
      ]).nota,
    ).toBe(4)
    expect(
      calcularNotaFinal([
        { ponderacion: 40, nota: 4 },
        { ponderacion: 60, nota: 4.1 },
      ]).nota,
    ).toBe(4.1)
    // (5,6 + 2 × 3,7) / 3 = 4,333… → 4,3.
    expect(
      calcularNotaFinal([
        { ponderacion: 1, nota: 5.6 },
        { ponderacion: 2, nota: 3.7 },
      ]).nota,
    ).toBe(4.3)
  })

  it('mientras falten notas es PARCIAL, sobre el porcentaje evaluado', () => {
    expect(
      calcularNotaFinal([
        { ponderacion: 20, nota: 7 },
        { ponderacion: 40, nota: 4 },
        { ponderacion: 40, nota: null },
      ]),
    ).toEqual({ tipo: 'PARCIAL', nota: 5, porcentajeEvaluado: 60 })
  })

  it('sin notas publicadas es PARCIAL sin nota', () => {
    expect(
      calcularNotaFinal([
        { ponderacion: 50, nota: null },
        { ponderacion: 50, nota: null },
      ]),
    ).toEqual({ tipo: 'PARCIAL', nota: null, porcentajeEvaluado: 0 })
    expect(calcularNotaFinal([])).toEqual({
      tipo: 'PARCIAL',
      nota: null,
      porcentajeEvaluado: 0,
    })
  })

  it.each([
    ['suman menos de 100', [40, 50]],
    ['suman más de 100', [60, 50]],
  ])(
    'con todo publicado pero ponderaciones que %s sigue PARCIAL (NOT-02)',
    (_caso, ponderaciones) => {
      const final = calcularNotaFinal(
        ponderaciones.map((ponderacion) => ({ ponderacion, nota: 5 })),
      )
      expect(final.tipo).toBe('PARCIAL')
      expect(final.nota).toBe(5)
    },
  )
})
