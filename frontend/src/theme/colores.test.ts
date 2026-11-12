import { colorConContraste, contrasteColores } from '@cursus/shared'
import { expect, test } from 'vitest'
import { coloresDelTema } from './colores'

test('contraste WCAG: blanco/negro es 21:1 y colores iguales son 1:1', () => {
  expect(contrasteColores('#ffffff', '#000000')).toBe(21)
  expect(contrasteColores('#1b4f72', '#1b4f72')).toBe(1)
})

test.each([
  '#ffffff',
  '#ffff00',
  '#00ff00',
  '#ff0000',
  '#777777',
  '#GGGGGG',
  'red',
  'url(x)',
])(
  'un color sin contraste o formato válido (%s) no se usa como tema',
  (color) => {
    expect(colorConContraste(color)).toBe(false)
    expect(coloresDelTema(color)).toBeNull()
  },
)

test.each([
  '#0a5c36',
  '#6b2d84',
  '#8b2635',
  '#005b66',
  '#7a4700',
  '#000000',
  '#6e6e6e',
])(
  'conserva el color %s y mantiene contraste de texto en los fondos del tema',
  (color) => {
    expect(colorConContraste(color)).toBe(true)
    const tema = coloresDelTema(color)!
    expect(tema['--color-primary']).toBe(color)
    for (const fondo of ['#ffffff', '#f4f8fb', tema['--color-primary-light']])
      expect(contrasteColores(color, fondo)).toBeGreaterThanOrEqual(4.5)
    expect(
      contrasteColores(
        tema['--color-primary-light'],
        tema['--color-primary-dark'],
      ),
    ).toBeGreaterThanOrEqual(4.5)
    expect(
      contrasteColores('#ffffff', tema['--color-primary-dark']),
    ).toBeGreaterThanOrEqual(4.5)
  },
)

test.each([null, undefined, '#1b4f72'])(
  '%s conserva los tokens originales de CURSUS',
  (color) => expect(coloresDelTema(color)).toBeNull(),
)
