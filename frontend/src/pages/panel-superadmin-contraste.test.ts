import { colorConContraste, contrasteColores } from '@cursus/shared'
import { describe, expect, test } from 'vitest'
import { coloresDelTema } from '@/theme/colores'

// UI/UX-09: al trabajar en una facultad, el superadmin toma el color de su
// universidad (TemaUniversidad). Lo que pinta el Dashboard con ese color: la
// insignia «Trabajando aquí» (blanco sobre el color) y la fila elegida (texto
// oscuro sobre el tono claro, con borde del color).
const BLANCO = '#ffffff'
const COLORES = ['#1b4f72', '#0a5c36', '#6b2d84', '#8d2f2f', '#00695c']

describe.each(COLORES)('universidad de color %s', (color) => {
  test('es un color aceptado', () => {
    expect(colorConContraste(color)).toBe(true)
  })

  const tema = coloresDelTema(color)
  const primario = tema?.['--color-primary'] ?? color
  const claro = tema?.['--color-primary-light'] ?? '#d6eaf8'
  const oscuro = tema?.['--color-primary-dark'] ?? '#0d2b45'

  test('la insignia (blanco sobre el color): AA', () => {
    expect(contrasteColores(BLANCO, primario)).toBeGreaterThanOrEqual(4.5)
  })

  test('la fila elegida (texto oscuro sobre el tono claro): AA', () => {
    expect(contrasteColores(oscuro, claro)).toBeGreaterThanOrEqual(4.5)
  })

  test('el borde de la fila elegida contra el blanco de la tarjeta: 3:1', () => {
    expect(contrasteColores(primario, BLANCO)).toBeGreaterThanOrEqual(3)
  })
})
