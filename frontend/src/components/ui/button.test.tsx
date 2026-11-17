import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { Button } from '@/components/ui/button'

// Dentro de un <form>, un <button> sin type es un botón de envío: «Cancelar» o
// «Mostrar contraseña» enviarían el formulario si el consumidor omite el tipo.
function formulario(botones: React.ReactNode) {
  const alEnviar = vi.fn((evento: React.FormEvent) => evento.preventDefault())
  render(
    <form aria-label="Datos" onSubmit={alEnviar}>
      <input aria-label="Nombre" defaultValue="Ana" />
      {botones}
    </form>,
  )
  return alEnviar
}

describe('Button dentro de un formulario', () => {
  test('sin type es type="button": hacer clic no envía el formulario', () => {
    const alEnviar = formulario(
      <>
        <Button>Cancelar</Button>
        <Button size="icon" aria-label="Mostrar contraseña">
          o
        </Button>
      </>,
    )
    for (const nombre of ['Cancelar', 'Mostrar contraseña']) {
      const boton = screen.getByRole('button', { name: nombre })
      expect(boton).toHaveAttribute('type', 'button')
      fireEvent.click(boton)
    }
    expect(alEnviar).not.toHaveBeenCalled()
  })

  test('con type="submit" explícito sigue enviando el formulario', () => {
    const alEnviar = formulario(
      <>
        <Button>Cancelar</Button>
        <Button type="submit">Guardar</Button>
      </>,
    )
    const guardar = screen.getByRole('button', { name: 'Guardar' })
    expect(guardar).toHaveAttribute('type', 'submit')
    fireEvent.click(guardar)
    expect(alEnviar).toHaveBeenCalledTimes(1)
  })

  test('conserva también type="reset"', () => {
    formulario(<Button type="reset">Limpiar</Button>)
    expect(screen.getByRole('button', { name: 'Limpiar' })).toHaveAttribute(
      'type',
      'reset',
    )
  })
})

describe('Button con asChild', () => {
  test('no pasa type="button" al enlace que renderiza', () => {
    formulario(
      <Button asChild>
        <a href="/curso">Ver curso</a>
      </Button>,
    )
    const enlace = screen.getByRole('link', { name: 'Ver curso' })
    expect(enlace).not.toHaveAttribute('type')
    expect(enlace).toHaveAttribute('data-slot', 'button')
  })

  test('el type que se pase explícitamente llega al hijo', () => {
    render(
      <Button asChild type="submit">
        <a href="/curso">Enlace</a>
      </Button>,
    )
    expect(screen.getByRole('link', { name: 'Enlace' })).toHaveAttribute(
      'type',
      'submit',
    )
  })

  test('sin asChild un botón suelto también es type="button"', () => {
    render(<Button>Aceptar</Button>)
    expect(screen.getByRole('button', { name: 'Aceptar' })).toHaveAttribute(
      'type',
      'button',
    )
  })
})
