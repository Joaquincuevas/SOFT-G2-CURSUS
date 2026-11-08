import { FORMATO_COLOR } from './superadmin.js'

export const MENSAJE_COLOR_CONTRASTE =
  'Elige un color más oscuro para que el texto sea legible (contraste mínimo 4,5:1)'

// WCAG 2.2: luminancia relativa sRGB y contraste sin redondear.
// https://www.w3.org/TR/WCAG22/#dfn-relative-luminance
export function contrasteColores(a: string, b: string): number {
  const luminancia = (hex: string) => {
    const canales = [1, 3, 5].map((inicio) => {
      const s = parseInt(hex.slice(inicio, inicio + 2), 16) / 255
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * canales[0] + 0.7152 * canales[1] + 0.0722 * canales[2]
  }
  const l1 = luminancia(a)
  const l2 = luminancia(b)
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}

// El principal se usa como fondo con texto blanco y como texto/enlace sobre
// blanco o la superficie clara de tokens.css. Debe servir en ambos casos.
export function colorConContraste(color: string): boolean {
  return (
    FORMATO_COLOR.test(color) &&
    ['#ffffff', '#f4f8fb'].every(
      (fondo) => contrasteColores(color, fondo) >= 4.5,
    )
  )
}
