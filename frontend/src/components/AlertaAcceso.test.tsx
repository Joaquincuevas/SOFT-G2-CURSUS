import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { AlertaAcceso } from './AlertaAcceso'

describe('AlertaAcceso', () => {
  test.each([
    ['danger', 'Credenciales inválidas.'],
    ['warning', 'Demasiados intentos fallidos.'],
    ['info', 'Tu sesión expiró.'],
  ] as const)(
    '%s se anuncia como alerta, con ícono y texto',
    (variante, texto) => {
      const { container } = render(
        <AlertaAcceso variante={variante} id="aviso">
          {texto}
        </AlertaAcceso>,
      )
      const alerta = screen.getByRole('alert')
      expect(alerta).toHaveAttribute('data-variant', variante)
      expect(alerta).toHaveAttribute('id', 'aviso')
      expect(alerta).toHaveTextContent(texto)
      // El color nunca va solo: lleva un ícono decorativo y el texto.
      expect(container.querySelector('svg')).toHaveAttribute(
        'aria-hidden',
        'true',
      )
      expect(alerta).toHaveAccessibleDescription('')
    },
  )

  test('cada variante usa un ícono distinto', () => {
    const iconos = (['danger', 'warning', 'info'] as const).map((variante) => {
      const { container, unmount } = render(
        <AlertaAcceso variante={variante}>x</AlertaAcceso>,
      )
      const clase = container.querySelector('svg')!.getAttribute('class')
      unmount()
      return clase
    })
    expect(new Set(iconos).size).toBe(3)
  })
})
