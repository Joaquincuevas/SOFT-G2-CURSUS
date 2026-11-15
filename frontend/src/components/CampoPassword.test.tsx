import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { Label } from '@/components/ui/label'
import { CampoPassword } from './CampoPassword'

function campo(props: Partial<Parameters<typeof CampoPassword>[0]> = {}) {
  const alEnviar = vi.fn((evento: React.FormEvent) => evento.preventDefault())
  render(
    <form aria-label="Acceso" onSubmit={alEnviar}>
      <Label htmlFor="clave">Contraseña</Label>
      <CampoPassword id="clave" etiqueta="Contraseña" name="clave" {...props} />
      <button type="submit">Enviar</button>
    </form>,
  )
  return alEnviar
}

describe('CampoPassword', () => {
  test('arranca oculta y su etiqueta la une al input', () => {
    campo()
    const entrada = screen.getByLabelText('Contraseña')
    expect(entrada).toHaveAttribute('type', 'password')
    expect(entrada).toHaveAttribute('id', 'clave')
  })

  test('el botón muestra y oculta la contraseña y anuncia su estado', () => {
    campo()
    const entrada = screen.getByLabelText('Contraseña')
    const mostrar = screen.getByRole('button', { name: 'Mostrar contraseña' })
    expect(mostrar).toHaveAttribute('aria-pressed', 'false')
    expect(mostrar).toHaveAttribute('aria-controls', 'clave')

    fireEvent.click(mostrar)
    expect(entrada).toHaveAttribute('type', 'text')
    const ocultar = screen.getByRole('button', { name: 'Ocultar contraseña' })
    expect(ocultar).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(ocultar)
    expect(entrada).toHaveAttribute('type', 'password')
    expect(
      screen.getByRole('button', { name: 'Mostrar contraseña' }),
    ).toBeInTheDocument()
  })

  test('el botón no envía el formulario y conserva lo escrito', () => {
    const alEnviar = campo()
    const entrada = screen.getByLabelText('Contraseña')
    fireEvent.change(entrada, { target: { value: 'secreta-123' } })
    const mostrar = screen.getByRole('button', { name: 'Mostrar contraseña' })
    expect(mostrar).toHaveAttribute('type', 'button')
    fireEvent.click(mostrar)
    expect(alEnviar).not.toHaveBeenCalled()
    expect(entrada).toHaveValue('secreta-123')
  })

  test('el nombre del botón incluye el del campo, para distinguirlos en un formulario con varios', () => {
    campo({ etiqueta: 'Contraseña nueva' })
    expect(
      screen.getByRole('button', { name: 'Mostrar contraseña nueva' }),
    ).toBeInTheDocument()
  })

  test('el botón se alcanza con el teclado, justo después del input', () => {
    campo()
    const controles = Array.from(
      document.querySelectorAll<HTMLElement>('input, button'),
    )
    expect(
      controles.map((c) => c.getAttribute('aria-label') ?? c.tagName),
    ).toEqual(['INPUT', 'Mostrar contraseña', 'BUTTON'])
    for (const control of controles)
      expect(control.tabIndex).toBeGreaterThanOrEqual(0)
    const mostrar = screen.getByRole('button', { name: 'Mostrar contraseña' })
    mostrar.focus()
    expect(mostrar).toHaveFocus()
    expect(mostrar).toHaveClass('focus-visible:ring-[3px]')
  })

  test('pasa al input sus atributos: invalidez, descripción, autocompletado y obligatoriedad', () => {
    campo({
      'aria-invalid': true,
      'aria-describedby': 'ayuda',
      autoComplete: 'new-password',
      required: true,
    })
    const entrada = screen.getByLabelText('Contraseña')
    expect(entrada).toBeInvalid()
    expect(entrada).toHaveAttribute('aria-describedby', 'ayuda')
    expect(entrada).toHaveAttribute('autocomplete', 'new-password')
    expect(entrada).toBeRequired()
  })
})
