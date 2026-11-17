import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { ConfirmDialog } from './ConfirmDialog'

function abrir(props: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) {
  const onConfirmar = vi.fn()
  const onAbiertoChange = vi.fn()
  render(
    <ConfirmDialog
      abierto
      onAbiertoChange={onAbiertoChange}
      titulo="¿Eliminar el curso?"
      descripcion="Esta acción no se puede deshacer."
      onConfirmar={onConfirmar}
      {...props}
    />,
  )
  return { onConfirmar, onAbiertoChange }
}

describe('ConfirmDialog', () => {
  test('cerrado no dibuja nada', () => {
    abrir({ abierto: false })
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  test('abierto es un alertdialog con su título y su descripción', () => {
    abrir()
    const dialogo = screen.getByRole('alertdialog')
    expect(dialogo).toHaveAccessibleName('¿Eliminar el curso?')
    expect(dialogo).toHaveAccessibleDescription(
      'Esta acción no se puede deshacer.',
    )
    expect(
      screen.getByRole('button', { name: 'Confirmar' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument()
  })

  test('el foco empieza en Cancelar, la opción segura', () => {
    abrir({ destructivo: true })
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus()
  })

  test('Confirmar avisa y no cierra: quien lo usa cierra al terminar', () => {
    const { onConfirmar, onAbiertoChange } = abrir()
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    expect(onConfirmar).toHaveBeenCalledOnce()
    expect(onAbiertoChange).not.toHaveBeenCalled()
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  })

  test('Cancelar y Escape piden cerrar', () => {
    const { onAbiertoChange, onConfirmar } = abrir()
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onAbiertoChange).toHaveBeenLastCalledWith(false)
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' })
    expect(onAbiertoChange).toHaveBeenCalledTimes(2)
    expect(onConfirmar).not.toHaveBeenCalled()
  })

  test('Confirmar se puede activar con el teclado: es un botón con foco', () => {
    abrir()
    const boton = screen.getByRole('button', { name: 'Confirmar' })
    boton.focus()
    expect(boton).toHaveFocus()
    expect(boton.tagName).toBe('BUTTON')
  })

  test('acepta otros textos para los botones', () => {
    abrir({ textoConfirmar: 'Eliminar', textoCancelar: 'Conservar' })
    expect(screen.getByRole('button', { name: 'Eliminar' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Conservar' }),
    ).toBeInTheDocument()
  })

  test('la variante destructiva pinta Confirmar en el color de peligro', () => {
    abrir({ destructivo: true })
    expect(screen.getByRole('button', { name: 'Confirmar' })).toHaveClass(
      'bg-destructive',
    )
  })

  test('sin la variante destructiva usa el color primario', () => {
    abrir()
    const confirmar = screen.getByRole('button', { name: 'Confirmar' })
    expect(confirmar).toHaveClass('bg-primary')
    expect(confirmar).not.toHaveClass('bg-destructive')
  })

  test('cargando: deshabilita los dos botones, lo anuncia y no se puede cerrar', () => {
    const { onAbiertoChange, onConfirmar } = abrir({ cargando: true })
    const confirmar = screen.getByRole('button', { name: /Confirmar/ })
    expect(confirmar).toBeDisabled()
    expect(confirmar).toHaveAttribute('aria-busy', 'true')
    expect(confirmar).toHaveTextContent('Procesando…')
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled()
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' })
    fireEvent.click(confirmar)
    expect(onAbiertoChange).not.toHaveBeenCalled()
    expect(onConfirmar).not.toHaveBeenCalled()
  })
})
