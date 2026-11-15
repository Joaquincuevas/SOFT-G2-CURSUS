import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { AuthLayout } from './AuthLayout'

describe('AuthLayout', () => {
  test('el título es el h1, con su descripción, el contenido y el pie', () => {
    render(
      <AuthLayout
        titulo="Bienvenido a CURSUS"
        descripcion="Ingresa con tus credenciales."
        pie={<p>Pie de la pantalla</p>}
      >
        <form aria-label="Acceso" />
      </AuthLayout>,
    )
    expect(
      screen.getByRole('heading', { level: 1, name: 'Bienvenido a CURSUS' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Ingresa con tus credenciales.')).toBeVisible()
    expect(screen.getByRole('form', { name: 'Acceso' })).toBeInTheDocument()
    expect(screen.getByText('Pie de la pantalla')).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
  })

  test('desde 1024 px lleva el panel de marca al lado; en pantalla angosta, solo el formulario', () => {
    const { container } = render(
      <AuthLayout titulo="Acceso">
        <p>Contenido</p>
      </AuthLayout>,
    )
    // El panel de marca existe y solo se ve desde lg.
    const panel = screen.getByRole('complementary')
    expect(panel).toHaveClass('hidden', 'lg:flex')
    expect(panel).toHaveTextContent('Gestión académica,')
    expect(panel).toHaveTextContent('en un solo lugar.')
    // El isotipo de la columna del formulario solo se ve cuando no hay panel.
    const isotipoMovil = container.querySelector('main svg')
    expect(isotipoMovil?.closest('p')).toHaveClass('lg:hidden')
    expect(isotipoMovil).toHaveAttribute('aria-hidden', 'true')
  })

  test('sin descripción ni pie no dibuja bloques vacíos', () => {
    const { container } = render(
      <AuthLayout titulo="Acceso">
        <p>Contenido</p>
      </AuthLayout>,
    )
    expect(container.querySelectorAll('main h1 + p')).toHaveLength(0)
  })
})
