/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { colorConContraste, contrasteColores } from '@cursus/shared'
import { describe, expect, test } from 'vitest'
import { coloresDelTema } from '@/theme/colores'

// Vitest no entrega el texto de un .css (ni con ?raw): se lee del disco.
const leer = (archivo: string) =>
  readFileSync(new URL(archivo, import.meta.url), 'utf8')
const alertas = leer('./alertas.css')
const shadcn = leer('./shadcn.css')
const tailwind = leer('./tailwind.css')
const tokens = leer('./tokens.css')

// UIX-01: base de Tailwind v4 y shadcn sobre los tokens de CURSUS. El CSS no
// se aplica en jsdom, así que se revisa lo que dice cada archivo.
const variables = (css: string) =>
  Object.fromEntries(
    [
      ...css
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .matchAll(/(--[\w-]+):\s*([^;]+);/g),
    ].map(([, nombre, valor]) => [nombre, valor.replace(/\s+/g, ' ').trim()]),
  )
const DE_SHADCN = variables(shadcn)
const DE_TOKENS = variables(tokens)

describe('variables de shadcn', () => {
  test('--primary sigue a --color-primary, el que cambia TemaUniversidad', () => {
    expect(DE_SHADCN['--primary']).toBe('var(--color-primary)')
    expect(DE_SHADCN['--ring']).toBe('var(--color-primary)')
    // Y TemaUniversidad sí cambia --color-primary para cada universidad.
    for (const color of ['#1b4f72', '#0a5c36', '#7b1fa2']) {
      const tema = coloresDelTema(color)
      if (color === '#1b4f72') expect(tema).toBeNull()
      else expect(tema?.['--color-primary']).toBe(color)
    }
  })

  test('define todas las variables que usan los componentes', () => {
    for (const nombre of [
      '--background',
      '--foreground',
      '--card',
      '--card-foreground',
      '--popover',
      '--popover-foreground',
      '--primary',
      '--primary-foreground',
      '--secondary',
      '--secondary-foreground',
      '--muted',
      '--muted-foreground',
      '--accent',
      '--accent-foreground',
      '--destructive',
      '--border',
      '--input',
      '--ring',
      '--radius',
    ]) {
      expect(DE_SHADCN, nombre).toHaveProperty(nombre)
    }
  })

  test('no duplica tokens.css: solo referencias a sus variables, salvo el blanco', () => {
    for (const [nombre, valor] of Object.entries(DE_SHADCN)) {
      if (nombre === '--primary-foreground') continue
      expect(valor, nombre).not.toMatch(/#[0-9a-f]{3,8}\b/i)
      for (const [, usada] of valor.matchAll(/var\((--[\w-]+)\)/g)) {
        expect(DE_TOKENS, `${nombre} usa ${usada}`).toHaveProperty(usada)
      }
    }
    // Y ninguna variable de shadcn pisa un token existente.
    for (const nombre of Object.keys(DE_SHADCN)) {
      expect(DE_TOKENS, nombre).not.toHaveProperty(nombre)
    }
  })

  test('el radio base es el de los controles de tokens.css', () => {
    expect(DE_SHADCN['--radius']).toBe('var(--radius-md)')
    expect(DE_TOKENS['--radius-md']).toBe('8px')
  })

  test('el texto blanco sobre --primary tiene contraste en toda universidad aceptada', () => {
    const aceptados = ['#1b4f72', '#0a5c36', '#7b1fa2', '#8d2f2f', '#00695c']
    for (const color of aceptados) {
      expect(colorConContraste(color)).toBe(true)
      expect(contrasteColores(color, '#ffffff'), color).toBeGreaterThanOrEqual(
        4.5,
      )
    }
    expect(DE_SHADCN['--primary-foreground']).toBe('#ffffff')
  })

  test('--muted-foreground se lee sobre --muted y sobre el fondo', () => {
    // --muted es 6 % de --color-text-primary sobre --color-surface.
    const muted = '#e8ecef'
    expect(
      contrasteColores(DE_TOKENS['--color-text-secondary'], muted),
    ).toBeGreaterThanOrEqual(4.5)
    expect(DE_SHADCN['--muted-foreground']).toBe('var(--color-text-secondary)')
  })
})

describe('borde de los campos', () => {
  test('--input tiene contraste 3:1 con blanco y con la superficie de la página', () => {
    const [, porcentaje] =
      /color-mix\(\s*in srgb,\s*var\(--color-text-secondary\)\s*(\d+)%/.exec(
        DE_SHADCN['--input'],
      ) ?? []
    const canal = (hex: string, i: number) => parseInt(hex.slice(i, i + 2), 16)
    const mezcla = (texto: string, fondo: string) =>
      `#${[1, 3, 5]
        .map((i) =>
          Math.round(
            (canal(texto, i) * Number(porcentaje)) / 100 +
              (canal(fondo, i) * (100 - Number(porcentaje))) / 100,
          )
            .toString(16)
            .padStart(2, '0'),
        )
        .join('')}`
    const borde = mezcla(DE_TOKENS['--color-text-secondary'], '#ffffff')
    for (const fondo of ['#ffffff', DE_TOKENS['--color-surface']]) {
      expect(contrasteColores(borde, fondo), fondo).toBeGreaterThanOrEqual(3)
    }
  })
})

describe('alertas suaves', () => {
  const ALERTAS = variables(alertas)
  const ESTADOS = ['success', 'danger', 'warning', 'info', 'accent']

  test.each(ESTADOS)('%s tiene fondo, borde y texto', (estado) => {
    for (const parte of ['', '-border', '-foreground']) {
      expect(ALERTAS[`--alert-${estado}${parte}`]).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  test.each(ESTADOS)(
    '%s: el texto cumple AA sobre su fondo y sobre blanco',
    (estado) => {
      const texto = ALERTAS[`--alert-${estado}-foreground`]
      for (const fondo of [
        ALERTAS[`--alert-${estado}`],
        '#ffffff',
        DE_TOKENS['--color-surface'],
      ]) {
        expect(
          contrasteColores(texto, fondo),
          `${estado} sobre ${fondo}`,
        ).toBeGreaterThanOrEqual(4.5)
      }
    },
  )

  test.each(ESTADOS)(
    '%s: el fondo es muy claro y el borde, más intenso',
    (estado) => {
      const fondo = ALERTAS[`--alert-${estado}`]
      const borde = ALERTAS[`--alert-${estado}-border`]
      expect(contrasteColores(fondo, '#ffffff')).toBeLessThan(1.2)
      expect(contrasteColores(borde, '#ffffff')).toBeGreaterThan(
        contrasteColores(fondo, '#ffffff'),
      )
    },
  )

  test('los cinco estados se registran como colores de Tailwind', () => {
    for (const estado of ESTADOS) {
      for (const parte of ['', '-border', '-foreground']) {
        expect(tailwind).toContain(
          `--color-alert-${estado}${parte}: var(--alert-${estado}${parte})`,
        )
      }
    }
    expect(tailwind).toMatch(
      /@utility alert-link\s*{[^}]*font-weight:\s*700[^}]*text-decoration-line:\s*underline/,
    )
  })
})

describe('tailwind sin preflight', () => {
  test('importa solo las capas theme y utilities', () => {
    expect(tailwind).toMatch(/@layer theme, base, components, utilities;/)
    expect(tailwind).toMatch(/@import 'tailwindcss\/theme\.css' layer\(theme\)/)
    expect(tailwind).toMatch(
      /@import 'tailwindcss\/utilities\.css' layer\(utilities\)/,
    )
  })

  test('no importa preflight ni tailwindcss entero', () => {
    const sinComentarios = tailwind.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(sinComentarios).not.toMatch(/preflight/)
    expect(sinComentarios).not.toMatch(/@import\s+['"]tailwindcss['"]/)
  })

  test('explica por qué y cuándo se activa', () => {
    expect(tailwind).toMatch(/UIX-24/)
    expect(tailwind).toMatch(/preflight/)
  })

  test('el borde por defecto de shadcn se acota a [data-slot], no a todo (*)', () => {
    expect(tailwind).toMatch(
      /\[data-slot\]\s*{[^}]*border-color:\s*var\(--border\)/,
    )
    expect(tailwind.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(
      /(^|\s)\*\s*{/,
    )
  })
})

describe('componentes de shadcn sin preflight', () => {
  const sinComentarios = tailwind.replace(/\/\*[\s\S]*?\*\//g, '')

  test('el mini-reset cubre botones, campos, enlaces, títulos, listas y tablas', () => {
    for (const regla of [
      /:is\(button, input, select, optgroup, textarea\)\[data-slot\]\s*{[^}]*font:\s*inherit/,
      /button\[data-slot\]\s*{[^}]*background-image:\s*none/,
      /textarea\[data-slot\]\s*{[^}]*resize:\s*vertical/,
      /a\[data-slot\]\s*{[^}]*text-decoration:\s*inherit/,
      /\[data-slot\]\s*{[^}]*border:\s*0 solid/,
      /:is\(ol, ul, li\)\[data-slot\]\s*{[^}]*list-style:\s*none/,
      /table\[data-slot\]\s*{[^}]*border-collapse:\s*collapse/,
    ]) {
      expect(sinComentarios).toMatch(regla)
    }
  })

  test('el mini-reset va en la capa base y solo sobre el elemento, no sobre sus hijos', () => {
    expect(sinComentarios).toMatch(/@layer base\s*{/)
    // Un descendiente (`[data-slot] *`, `[data-slot] p`…) tocaría una página
    // legacy montada dentro de un componente.
    expect(sinComentarios).not.toMatch(/\[data-slot[^\]]*\]\s+[a-z*.:[]/i)
  })

  test('la variante dark depende de una clase, no de la preferencia del sistema', () => {
    expect(sinComentarios).toMatch(/@custom-variant dark \(&:is\(\.dark \*\)\)/)
  })

  test('el mínimo táctil de 44 px es solo para puntero grueso', () => {
    expect(sinComentarios).toMatch(
      /@media \(pointer: coarse\)\s*{[\s\S]*min-height:\s*44px/,
    )
  })
})
