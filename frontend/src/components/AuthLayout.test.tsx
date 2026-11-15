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

  test('desde 1024 px el panel de marca con la foto va a la izquierda y el formulario a la derecha', () => {
    const { container } = render(
      <AuthLayout titulo="Acceso">
        <p>Contenido</p>
      </AuthLayout>,
    )
    const principal = screen.getByRole('main')
    const panel = screen.getByRole('complementary')
    // En el documento el formulario va primero (en pantalla angosta, donde el
    // panel está oculto, queda solo el formulario); desde lg el panel pasa a la
    // izquierda.
    expect(principal.nextElementSibling).toBe(panel)
    expect(panel).toHaveClass('hidden', 'lg:block', 'lg:order-first')
    expect(container.querySelector('main + aside img')).toHaveAttribute(
      'alt',
      '',
    )
  })

  test('el isotipo con el nombre identifica la pantalla en todos los tamaños', () => {
    const { container } = render(
      <AuthLayout titulo="Acceso">
        <p>Contenido</p>
      </AuthLayout>,
    )
    const isotipo = container.querySelector('main svg')
    expect(isotipo).toHaveAttribute('aria-hidden', 'true')
    expect(isotipo?.closest('p')).toHaveTextContent('CURSUS')
    expect(isotipo?.closest('p')).not.toHaveClass('lg:hidden')
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
