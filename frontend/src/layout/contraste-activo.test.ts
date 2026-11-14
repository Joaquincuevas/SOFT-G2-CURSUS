import { COLOR_CURSUS, contrasteColores } from '@cursus/shared'
import { describe, expect, test } from 'vitest'
import { coloresDelTema } from '@/theme/colores'

// UIX-04: el estado activo del menú lateral y de la navegación del curso usa
// --accent (primary-light) de fondo, --accent-foreground (primary-dark) de
// texto y --primary en el ícono y la barra. Los tres valores salen del color de
// la universidad (TemaUniversidad); el Director y el login usan el de CURSUS.
const CLARO_CURSUS = '#d6eaf8'
const OSCURO_CURSUS = '#0d2b45'

// Norte (el de CURSUS) y Sur son las universidades del seed; los otros son
// colores que colorConContraste acepta.
const UNIVERSIDADES: [string, string][] = [
  ['CURSUS y Norte', COLOR_CURSUS],
  ['Sur', '#0a5c36'],
  ['violeta', '#6b2d84'],
  ['burdeos', '#8d2f2f'],
  ['verde azulado', '#00695c'],
]

describe('contraste del estado activo', () => {
  test.each(UNIVERSIDADES)('%s', (_nombre, color) => {
    const tema = coloresDelTema(color)
    const primario = tema?.['--color-primary'] ?? color
    const claro = tema?.['--color-primary-light'] ?? CLARO_CURSUS
    const oscuro = tema?.['--color-primary-dark'] ?? OSCURO_CURSUS

    // Texto del ítem activo sobre su fondo, y el título del encabezado
    // (--primary sobre blanco): AA para texto normal.
    expect(contrasteColores(oscuro, claro)).toBeGreaterThanOrEqual(4.5)
    expect(contrasteColores(primario, '#ffffff')).toBeGreaterThanOrEqual(4.5)
    // Ícono y barra sobre el fondo del ítem y sobre el menú: 3:1 para
    // componentes gráficos (WCAG 1.4.11).
    expect(contrasteColores(primario, claro)).toBeGreaterThanOrEqual(3)
    expect(contrasteColores(primario, '#ffffff')).toBeGreaterThanOrEqual(3)
  })
})
