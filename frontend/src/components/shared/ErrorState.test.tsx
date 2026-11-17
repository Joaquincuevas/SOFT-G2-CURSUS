import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { ErrorEstado } from '../ErrorEstado'
import { ErrorState } from './ErrorState'

describe('ErrorState', () => {
  test('anuncia el error con role="alert", su título y su mensaje', () => {
    render(
      <ErrorState
        mensaje="No pudimos cargar los cursos."
        onReintentar={vi.fn()}
      />,
    )
    const alerta = screen.getByRole('alert')
    expect(alerta).toHaveTextContent('No pudimos cargar los cursos.')
    expect(
      screen.getByRole('heading', { level: 2, name: 'No se pudo cargar' }),
    ).toBeInTheDocument()
  })

  test('Reintentar llama a onReintentar', () => {
    const reintentar = vi.fn()
    render(<ErrorState mensaje="Falló." onReintentar={reintentar} />)
    const boton = screen.getByRole('button', { name: 'Reintentar' })
    boton.focus()
    expect(boton).toHaveFocus()
    fireEvent.click(boton)
    expect(reintentar).toHaveBeenCalledOnce()
  })

  test('acepta otro título y otro texto de botón', () => {
    render(
      <ErrorState
        titulo="Algo salió mal"
        mensaje="Recarga la página."
        textoBoton="Recargar"
        onReintentar={vi.fn()}
      />,
    )
    expect(
      screen.getByRole('heading', { name: 'Algo salió mal' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Recargar' })).toBeInTheDocument()
  })

  test('el título va en el color de peligro y no usa solo el color: tiene texto', () => {
    render(<ErrorState mensaje="Falló." onReintentar={vi.fn()} />)
    expect(screen.getByRole('heading')).toHaveClass('text-destructive')
  })

  test('en pantalla completa va en un main con el isotipo; dentro de una página, no', () => {
    const { unmount } = render(
      <ErrorState mensaje="Falló." onReintentar={vi.fn()} pantallaCompleta />,
    )
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'CURSUS' })).toBeInTheDocument()
    unmount()
    render(<ErrorState mensaje="Falló." onReintentar={vi.fn()} />)
    expect(screen.queryByRole('main')).toBeNull()
    expect(screen.queryByRole('img')).toBeNull()
  })

  test('ErrorEstado, el nombre que usan las páginas, es este mismo componente', () => {
    expect(ErrorEstado).toBe(ErrorState)
  })
})
