import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { CursusLogo } from './CursusLogo'

describe('CursusLogo', () => {
  test('es una imagen accesible llamada CURSUS', () => {
    render(<CursusLogo />)
    const logo = screen.getByRole('img', { name: 'CURSUS' })
    expect(logo).toHaveAttribute('aria-label', 'CURSUS')
    expect(logo.tagName.toLowerCase()).toBe('svg')
  })

  test('toma el color del texto: el trazo va con currentColor y sin color fijo', () => {
    const { container } = render(<CursusLogo className="text-primary" />)
    const trazos = container.querySelectorAll('path')
    expect(trazos).toHaveLength(1)
    expect(trazos[0]).toHaveAttribute('fill', 'currentColor')
    expect(container.querySelector('[fill]:not([fill="currentColor"])')).toBe(
      null,
    )
    expect(screen.getByRole('img')).toHaveClass('text-primary')
  })

  test('mide 32 px por defecto y acepta otro tamaño', () => {
    const { rerender } = render(<CursusLogo />)
    expect(screen.getByRole('img')).toHaveAttribute('width', '32')
    expect(screen.getByRole('img')).toHaveAttribute('height', '32')
    rerender(<CursusLogo size={56} />)
    expect(screen.getByRole('img')).toHaveAttribute('width', '56')
    expect(screen.getByRole('img')).toHaveAttribute('height', '56')
  })

  test('title cambia el nombre accesible', () => {
    render(<CursusLogo title="Inicio de CURSUS" />)
    expect(
      screen.getByRole('img', { name: 'Inicio de CURSUS' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'CURSUS' })).toBeNull()
  })

  test('decorativo lo oculta a los lectores de pantalla', () => {
    const { container } = render(<CursusLogo decorativo />)
    expect(screen.queryByRole('img')).toBeNull()
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).not.toHaveAttribute('aria-label')
  })
})
