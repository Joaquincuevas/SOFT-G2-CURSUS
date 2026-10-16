import type { NavIconName } from '../navigation'

// Íconos del Sidebar en el Figma (ic/grid, ic/book, ic/power), 20×20.
// En el Figma el hueco del libro y del power se tapa con un rectángulo del
// color de fondo; aquí se recorta con la forma, así funcionan en hover.

const svgProps = {
  width: 20,
  height: 20,
  viewBox: '0 0 20 20',
  fill: 'currentColor',
  'aria-hidden': true,
  focusable: false,
} as const

export function NavIcon({ name }: { name: NavIconName }) {
  if (name === 'grid') {
    return (
      <svg {...svgProps}>
        <rect x="2" y="2" width="7" height="7" rx="1.5" />
        <rect x="11" y="2" width="7" height="7" rx="1.5" />
        <rect x="2" y="11" width="7" height="7" rx="1.5" />
        <rect x="11" y="11" width="7" height="7" rx="1.5" />
      </svg>
    )
  }
  return (
    <svg {...svgProps}>
      <path d="M4.5 3H9v14H4.5A1.5 1.5 0 0 1 3 15.5v-11A1.5 1.5 0 0 1 4.5 3Z" />
      <path d="M11 3h4.5A1.5 1.5 0 0 1 17 4.5v11a1.5 1.5 0 0 1-1.5 1.5H11V3Z" />
    </svg>
  )
}

export function PowerIcon() {
  return (
    <svg {...svgProps}>
      <path
        d="M7 6.574A6.2 6.2 0 1 0 13 6.574"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <rect x="9" y="3" width="2" height="7" />
    </svg>
  )
}

export function MenuIcon() {
  return (
    <svg {...svgProps}>
      <rect x="2" y="4" width="16" height="2" rx="1" />
      <rect x="2" y="9" width="16" height="2" rx="1" />
      <rect x="2" y="14" width="16" height="2" rx="1" />
    </svg>
  )
}
