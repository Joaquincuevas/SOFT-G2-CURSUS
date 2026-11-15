import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { PanelMarca } from './PanelMarca'

// El login, el segundo paso de MFA, la recuperación y el cambio obligatorio
// de contraseña comparten este panel: el isotipo va blanco sobre el fondo
// oscuro y junto al nombre, así que no se lee dos veces.
test('el panel de marca lleva el isotipo blanco junto al nombre', () => {
  const { container } = render(<PanelMarca />)
  const isotipo = container.querySelector('svg')
  expect(isotipo).toHaveClass('text-white')
  expect(isotipo).toHaveAttribute('aria-hidden', 'true')
  expect(screen.queryByRole('img')).toBeNull()
  expect(container.querySelector('.login__logo')).toHaveTextContent('CURSUS')
})
