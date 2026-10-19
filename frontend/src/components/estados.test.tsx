import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { Cargando } from './Cargando'
import { ErrorEstado } from './ErrorEstado'

describe('Cargando', () => {
  test('anuncia el texto con role="status"', () => {
    render(<Cargando />)
    const estado = screen.getByRole('status')
    expect(estado).toHaveTextContent('Cargando…')
    expect(estado).toHaveAttribute('aria-live', 'polite')
  })

  test('acepta otro texto y la variante de página completa', () => {
    render(<Cargando texto="Cargando cursos…" pantallaCompleta />)
    expect(screen.getByRole('status')).toHaveTextContent('Cargando cursos…')
  })
})

describe('ErrorEstado', () => {
  test('muestra el mensaje con role="alert" y Reintentar llama a onReintentar', () => {
    const onReintentar = vi.fn()
    render(
      <ErrorEstado
        mensaje="No se pudieron cargar los cursos."
        onReintentar={onReintentar}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(
      'No se pudieron cargar los cursos.',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(onReintentar).toHaveBeenCalledOnce()
  })

  test('acepta otro título y otro texto de botón', () => {
    render(
      <ErrorEstado
        titulo="Algo salió mal"
        mensaje="x"
        textoBoton="Recargar"
        onReintentar={() => {}}
      />,
    )
    expect(
      screen.getByRole('heading', { name: 'Algo salió mal' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Recargar' })).toBeInTheDocument()
  })
})
