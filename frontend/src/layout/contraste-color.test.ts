/// <reference types="node" />
import { readFileSync } from 'node:fs'
import {
  COLOR_CURSUS,
  colorConContraste,
  contrasteColores,
} from '@cursus/shared'
import { describe, expect, test } from 'vitest'
import { coloresDelTema } from '@/theme/colores'

// UIX-04: el color de la universidad (--color-primary) es el fondo del
// encabezado y del ítem activo del menú, con texto e ícono blancos. Los tonos
// claro y oscuro salen de TemaUniversidad; el Director y el login usan el de
// CURSUS. Norte usa el de CURSUS y Sur es el otro del seed.
const BLANCO = '#ffffff'
const TEXTO = '#333333'
const TEXTO_SECUNDARIO = '#666666'
const CLARO_CURSUS = '#d6eaf8'
const OSCURO_CURSUS = '#0d2b45'

const UNIVERSIDADES: [string, string][] = [
  ['CURSUS, Norte y Director', COLOR_CURSUS],
  ['Sur', '#0a5c36'],
  ['violeta', '#6b2d84'],
  ['burdeos', '#8d2f2f'],
  ['verde azulado', '#00695c'],
]

function tonos(color: string) {
  const tema = coloresDelTema(color)
  return {
    primario: tema?.['--color-primary'] ?? color,
    claro: tema?.['--color-primary-light'] ?? CLARO_CURSUS,
    oscuro: tema?.['--color-primary-dark'] ?? OSCURO_CURSUS,
  }
}

// --color-fondo-pagina (tokens.css): el porcentaje del color sobre blanco se
// lee del CSS para que el test mida lo mismo que se pinta.
// Vitest no entrega el texto de un .css (ni con ?raw): se lee del disco. La
// ruta va en una variable para que Vite no la trate como un asset.
const rutaTokens = '../styles/tokens.css'
const tokens = readFileSync(new URL(rutaTokens, import.meta.url), 'utf8')
const PORCENTAJE_FONDO = Number(
  /--color-fondo-pagina:\s*color-mix\(in srgb, var\(--color-primary\) (\d+)%, #ffffff\)/.exec(
    tokens,
  )?.[1],
)
// color-mix(in srgb, color pct%, #ffffff)
function tinte(color: string, porcentaje: number) {
  const canales = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16))
  const mezcla = canales.map((c) =>
    Math.round((c * porcentaje + 255 * (100 - porcentaje)) / 100),
  )
  return `#${mezcla.map((c) => c.toString(16).padStart(2, '0')).join('')}`
}
const fondoDePagina = (color: string) => tinte(color, PORCENTAJE_FONDO)

// Menú de usuario (MenuUsuario.tsx): el tinte de su cabecera sale de la clase
// que se pinta, y el color de peligro, de tokens.css (--destructive apunta a
// --color-error).
const rutaMenu = './MenuUsuario.tsx'
const fuenteMenu = readFileSync(new URL(rutaMenu, import.meta.url), 'utf8')
const PORCENTAJE_CABECERA = Number(
  /bg-\[color-mix\(in_srgb,var\(--color-primary\)_(\d+)%,#fff\)\]/.exec(
    fuenteMenu,
  )?.[1],
)
const PELIGRO = /--color-error:\s*(#[0-9a-f]{6})/i.exec(tokens)?.[1] ?? ''
// El Director conserva el color de CURSUS en cualquier universidad
// (TemaUniversidad).
const ROLES = [
  'DIRECTOR',
  'ADMINISTRATIVO',
  'PROFESOR',
  'AYUDANTE',
  'ALUMNO',
] as const
const colorDelRol = (rol: string, color: string) =>
  rol === 'DIRECTOR' ? COLOR_CURSUS : color

describe('contraste del color de la universidad', () => {
  test('el fondo de la página sale de un porcentaje leído de tokens.css', () => {
    expect(PORCENTAJE_FONDO).toBeGreaterThan(0)
    expect(PORCENTAJE_FONDO).toBeLessThanOrEqual(10)
  })

  describe.each(UNIVERSIDADES)('%s', (_nombre, color) => {
    const { primario, claro, oscuro } = tonos(color)

    test('texto e ícono blancos sobre el encabezado y el ítem activo: AA', () => {
      expect(contrasteColores(BLANCO, primario)).toBeGreaterThanOrEqual(4.5)
    })

    test('hover y menú abierto del encabezado (blanco sobre el tono oscuro): AA', () => {
      expect(contrasteColores(BLANCO, oscuro)).toBeGreaterThanOrEqual(4.5)
    })

    test('el pill de semestre, el avatar y el hover del menú (oscuro sobre claro): AA', () => {
      expect(contrasteColores(oscuro, claro)).toBeGreaterThanOrEqual(4.5)
    })

    test('el aro de foco blanco se ve sobre el encabezado, y el acento y el aro del menú sobre blanco: 3:1', () => {
      expect(contrasteColores(BLANCO, primario)).toBeGreaterThanOrEqual(3)
      expect(contrasteColores(primario, BLANCO)).toBeGreaterThanOrEqual(3)
    })

    test('el texto de la página se lee sobre el fondo con tinte: AA', () => {
      const fondo = fondoDePagina(primario)
      expect(contrasteColores(TEXTO, fondo)).toBeGreaterThanOrEqual(4.5)
      expect(contrasteColores(TEXTO_SECUNDARIO, fondo)).toBeGreaterThanOrEqual(
        4.5,
      )
      // Los títulos y enlaces en el color de la universidad también.
      expect(contrasteColores(primario, fondo)).toBeGreaterThanOrEqual(4.5)
    })
  })

  describe('menú de usuario, por rol y universidad', () => {
    test('lee el tinte de la cabecera y el color de peligro de donde se pintan', () => {
      expect(PORCENTAJE_CABECERA).toBeGreaterThan(0)
      expect(PORCENTAJE_CABECERA).toBeLessThanOrEqual(10)
      expect(PELIGRO).toMatch(/^#[0-9a-f]{6}$/i)
    })

    const casos = ROLES.flatMap((rol) =>
      UNIVERSIDADES.map(([nombre, color]) => [rol, nombre, color] as const),
    )
    describe.each(casos)('%s en %s', (rol, _nombre, colorUniversidad) => {
      const { primario, claro, oscuro } = tonos(
        colorDelRol(rol, colorUniversidad),
      )

      test('cabecera: nombre, correo y universidad sobre el tinte, y las iniciales blancas sobre el color: AA', () => {
        const fondo = tinte(primario, PORCENTAJE_CABECERA)
        expect(contrasteColores(TEXTO, fondo)).toBeGreaterThanOrEqual(4.5)
        expect(
          contrasteColores(TEXTO_SECUNDARIO, fondo),
        ).toBeGreaterThanOrEqual(4.5)
        expect(contrasteColores(BLANCO, primario)).toBeGreaterThanOrEqual(4.5)
        // El rol va en un Badge blanco con texto oscuro.
        expect(contrasteColores(TEXTO, BLANCO)).toBeGreaterThanOrEqual(4.5)
      })

      test('hover y foco de Mi perfil: texto oscuro sobre el tinte (AA), ícono y aro de foco: 3:1', () => {
        expect(contrasteColores(oscuro, claro)).toBeGreaterThanOrEqual(4.5)
        expect(
          contrasteColores(TEXTO_SECUNDARIO, claro),
        ).toBeGreaterThanOrEqual(3)
        expect(contrasteColores(primario, claro)).toBeGreaterThanOrEqual(3)
        expect(contrasteColores(TEXTO, BLANCO)).toBeGreaterThanOrEqual(4.5)
      })

      test('Cerrar sesión en el color de peligro: AA en reposo y con el fondo de foco; el aro, 3:1', () => {
        const fondoFoco = tinte(PELIGRO, 10)
        expect(contrasteColores(PELIGRO, BLANCO)).toBeGreaterThanOrEqual(4.5)
        expect(contrasteColores(PELIGRO, fondoFoco)).toBeGreaterThanOrEqual(4.5)
      })
    })

    test('para cualquier color aceptado la cabecera y el hover se leen (AA)', () => {
      let semilla = 777
      const azar = () => (semilla = (semilla * 1664525 + 1013904223) % 2 ** 32)
      let aceptados = 0
      for (let i = 0; i < 6000; i++) {
        const color = `#${(azar() % 2 ** 24).toString(16).padStart(6, '0')}`
        if (!colorConContraste(color)) continue
        aceptados++
        const { primario, claro, oscuro } = tonos(color)
        const fondo = tinte(primario, PORCENTAJE_CABECERA)
        expect(
          contrasteColores(TEXTO_SECUNDARIO, fondo),
        ).toBeGreaterThanOrEqual(4.5)
        expect(contrasteColores(oscuro, claro)).toBeGreaterThanOrEqual(4.5)
      }
      expect(aceptados).toBeGreaterThan(100)
    })
  })

  // Un color solo se guarda si colorConContraste lo acepta: el texto blanco
  // sobre cualquiera de ellos cumple AA sin calcular otro color de texto.
  test('todo color aceptado admite texto blanco (4,5:1), con sus tonos claro y oscuro', () => {
    let semilla = 20260
    const azar = () => (semilla = (semilla * 1664525 + 1013904223) % 2 ** 32)
    let aceptados = 0
    for (let i = 0; i < 6000; i++) {
      const color = `#${(azar() % 2 ** 24).toString(16).padStart(6, '0')}`
      if (!colorConContraste(color)) continue
      aceptados++
      const { primario, claro, oscuro } = tonos(color)
      expect(contrasteColores(BLANCO, primario)).toBeGreaterThanOrEqual(4.5)
      expect(contrasteColores(BLANCO, oscuro)).toBeGreaterThanOrEqual(4.5)
      expect(contrasteColores(oscuro, claro)).toBeGreaterThanOrEqual(4.5)
    }
    expect(aceptados).toBeGreaterThan(100)
  })

  test('un color sin contraste con blanco no se acepta, así que nunca llega al encabezado', () => {
    for (const color of ['#ffeb3b', '#80cbc4', '#ff9800'])
      expect(colorConContraste(color)).toBe(false)
  })
})
