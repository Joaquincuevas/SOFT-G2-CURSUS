import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'
import { ErrorBoundary } from './ErrorBoundary'

const ERROR = new Error('detalle interno que el usuario no debe ver')

function Lanza(): never {
  throw ERROR
}

// React también escribe el error en la consola; se silencia y se revisa.
const consola = vi.spyOn(console, 'error').mockImplementation(() => {})
afterEach(() => consola.mockClear())

test('un error de render muestra la página de error, sin el detalle', () => {
  render(
    <ErrorBoundary>
      <MemoryRouter>
        <Lanza />
      </MemoryRouter>
    </ErrorBoundary>,
  )

  expect(screen.getByRole('alert')).toHaveTextContent('Algo salió mal')
  expect(screen.queryByText(/detalle interno/)).not.toBeInTheDocument()
  expect(consola).toHaveBeenCalledWith(
    'Error inesperado en la interfaz',
    ERROR,
    expect.any(String),
  )
})

test('funciona por fuera del router y Recargar recarga la página', () => {
  const recargar = vi.fn()
  // Sin MemoryRouter: si la página de error usara <Link> o hooks del router,
  // este render fallaría.
  render(
    <ErrorBoundary recargar={recargar}>
      <Lanza />
    </ErrorBoundary>,
  )

  fireEvent.click(screen.getByRole('button', { name: 'Recargar' }))
  expect(recargar).toHaveBeenCalledOnce()
})

test('sin error muestra el contenido', () => {
  render(
    <ErrorBoundary>
      <p>contenido</p>
    </ErrorBoundary>,
  )
  expect(screen.getByText('contenido')).toBeInTheDocument()
})
