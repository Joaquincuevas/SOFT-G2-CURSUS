import {
  COLOR_CURSUS,
  colorConContraste,
  contrasteColores,
} from '@cursus/shared'

type Rgb = [number, number, number]

const rgb = (hex: string): Rgb => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
]
const hex = (color: Rgb) =>
  `#${color.map((canal) => canal.toString(16).padStart(2, '0')).join('')}`

function mezclar(color: Rgb, destino: number, proporcion: number): Rgb {
  return color.map((canal) =>
    Math.round(canal * (1 - proporcion) + destino * proporcion),
  ) as Rgb
}

// Conserva exactamente el color elegido: un principal sin contraste se
// rechaza al guardar. Para colores antiguos inválidos usa el tema de CURSUS.
export function coloresDelTema(color: string | null | undefined) {
  if (!color || !colorConContraste(color) || color === COLOR_CURSUS) return null

  const institucional = rgb(color)
  let claro = mezclar(institucional, 255, 0.9)
  // El avatar usa el principal como texto sobre primary-light.
  for (let paso = 90; paso <= 100; paso++) {
    claro = mezclar(institucional, 255, paso / 100)
    if (contrasteColores(color, hex(claro)) >= 4.5) break
  }
  const oscuro = mezclar(institucional, 0, 0.4)
  return {
    '--color-primary': color,
    '--color-primary-dark': hex(oscuro),
    '--color-primary-light': hex(claro),
    '--color-primary-hover': `rgb(${institucional.join(' ')} / 50%)`,
    '--color-backdrop': `rgb(${oscuro.join(' ')} / 40%)`,
  }
}
