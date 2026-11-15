/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { COLOR_CURSUS, contrasteColores } from '@cursus/shared'
import { describe, expect, test } from 'vitest'

// UI/UX-08: el Director conserva el azul de CURSUS (no toma el color de la
// universidad). Los pares de color del Dashboard, Indicadores y Reporte salen
// de tokens.css: este test mide los mismos valores que se pintan.
const rutaTokens = '../styles/tokens.css'
const tokens = readFileSync(new URL(rutaTokens, import.meta.url), 'utf8')
const token = (nombre: string) => {
  const valor = new RegExp(`${nombre}:\\s*(#[0-9a-f]{6})`, 'i').exec(
    tokens,
  )?.[1]
  if (!valor) throw new Error(`Falta ${nombre} en tokens.css`)
  return valor
}

const BLANCO = token('--color-background')
const SUPERFICIE = token('--color-surface')
const TEXTO = token('--color-text-primary')
const TEXTO_SECUNDARIO = token('--color-text-secondary')
const PRIMARIO = token('--color-primary')
const PRIMARIO_CLARO = token('--color-primary-light')
const PRIMARIO_OSCURO = token('--color-primary-dark')
const ERROR = token('--color-error')

// color-mix(in srgb, color pct%, base): el --muted de shadcn.css (6 % del texto
// sobre la superficie), que es el fondo de las pistas de las barras y de los
// encabezados de tabla (bg-muted/60).
function mezcla(color: string, porcentaje: number, base: string) {
  const canal = (hex: string, i: number) => parseInt(hex.slice(i, i + 2), 16)
  const mezclado = [1, 3, 5].map((i) =>
    Math.round(
      (canal(color, i) * porcentaje + canal(base, i) * (100 - porcentaje)) /
        100,
    ),
  )
  return `#${mezclado.map((c) => c.toString(16).padStart(2, '0')).join('')}`
}
const MUTED = mezcla(TEXTO, 6, SUPERFICIE)

describe('contraste de las pantallas del Director', () => {
  test('el color del Director es el azul de CURSUS', () => {
    expect(PRIMARIO.toLowerCase()).toBe(COLOR_CURSUS.toLowerCase())
  })

  test('valores y títulos (texto principal) sobre las tarjetas: AA', () => {
    expect(contrasteColores(TEXTO, BLANCO)).toBeGreaterThanOrEqual(4.5)
  })

  test('detalles y rótulos (texto secundario) sobre tarjetas y encabezados de tabla: AA', () => {
    expect(contrasteColores(TEXTO_SECUNDARIO, BLANCO)).toBeGreaterThanOrEqual(
      4.5,
    )
    expect(contrasteColores(TEXTO_SECUNDARIO, MUTED)).toBeGreaterThanOrEqual(
      4.5,
    )
    expect(
      contrasteColores(TEXTO_SECUNDARIO, SUPERFICIE),
    ).toBeGreaterThanOrEqual(4.5)
  })

  test('los enlaces en el azul de CURSUS se leen sobre blanco, la superficie y las filas de grupo: AA', () => {
    expect(contrasteColores(PRIMARIO, BLANCO)).toBeGreaterThanOrEqual(4.5)
    expect(contrasteColores(PRIMARIO, SUPERFICIE)).toBeGreaterThanOrEqual(4.5)
    expect(contrasteColores(PRIMARIO, MUTED)).toBeGreaterThanOrEqual(4.5)
  })

  test('el ícono de los accesos directos (azul oscuro sobre azul claro): AA', () => {
    expect(
      contrasteColores(PRIMARIO_OSCURO, PRIMARIO_CLARO),
    ).toBeGreaterThanOrEqual(4.5)
  })

  test('la línea y el rótulo de aprobación (peligro sobre blanco): AA', () => {
    expect(contrasteColores(ERROR, BLANCO)).toBeGreaterThanOrEqual(4.5)
  })

  test('las barras se distinguen de su pista y de la tarjeta: 3:1', () => {
    expect(contrasteColores(PRIMARIO, MUTED)).toBeGreaterThanOrEqual(3)
    expect(contrasteColores(PRIMARIO, BLANCO)).toBeGreaterThanOrEqual(3)
  })
})
