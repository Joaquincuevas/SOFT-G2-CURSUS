import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { PanelMarca } from './PanelMarca'

// El login, el segundo paso de MFA, la recuperación y el cambio obligatorio
// de contraseña comparten este panel: una foto decorativa con el mensaje de
// CURSUS encima. Solo se ve desde 1024 px.
test('el panel de marca lleva la foto decorativa y el mensaje, y solo se ve desde lg', () => {
  const { container } = render(<PanelMarca />)
  const panel = screen.getByRole('complementary')
  expect(panel).toHaveClass('hidden', 'lg:block')
  // La foto no aporta información: sin texto alternativo, no se anuncia.
  const foto = container.querySelector('img')
  expect(foto).toHaveAttribute('alt', '')
  expect(screen.queryByRole('img')).toBeNull()
  expect(panel).toHaveTextContent('Gestión académica,')
  expect(panel).toHaveTextContent('en un solo lugar.')
  expect(panel).toHaveTextContent('CURSUS centraliza cursos')
})
