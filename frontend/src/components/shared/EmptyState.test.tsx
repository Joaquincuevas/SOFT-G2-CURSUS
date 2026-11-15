import { fireEvent, render, screen } from '@testing-library/react'
import { Users } from 'lucide-react'
import { describe, expect, test, vi } from 'vitest'
import { Button } from '@/components/ui/button'
import { EmptyState } from './EmptyState'

describe('EmptyState', () => {
  test('muestra el mensaje con un ícono decorativo por defecto', () => {
    const { container } = render(<EmptyState mensaje="Aún no hay cursos." />)
    expect(screen.getByText('Aún no hay cursos.')).toBeInTheDocument()
    // El círculo con el ícono es decorativo: el mensaje ya lo dice todo.
    expect(
      container.querySelector('span[aria-hidden="true"] > svg'),
    ).not.toBeNull()
  })

  test('acepta el ícono de lucide que se le pase', () => {
    const { container } = render(
      <EmptyState icono={Users} mensaje="Aún no hay alumnos." />,
    )
    expect(container.querySelector('svg.lucide-users')).not.toBeNull()
  })

  test('con título lo muestra como h3, y sin título no hay encabezado', () => {
    const { unmount } = render(
      <EmptyState titulo="Sin cursos" mensaje="Crea el primero." />,
    )
    expect(
      screen.getByRole('heading', { level: 3, name: 'Sin cursos' }),
    ).toBeInTheDocument()
    unmount()
    render(<EmptyState mensaje="Crea el primero." />)
    expect(screen.queryByRole('heading')).toBeNull()
  })

  test('la acción es opcional y se puede usar con el teclado', () => {
    const { unmount } = render(<EmptyState mensaje="Nada por aquí." />)
    expect(screen.queryByRole('button')).toBeNull()
    unmount()

    const crear = vi.fn()
    render(
      <EmptyState
        mensaje="Nada por aquí."
        accion={<Button onClick={crear}>Crear curso</Button>}
      />,
    )
    const boton = screen.getByRole('button', { name: 'Crear curso' })
    boton.focus()
    expect(boton).toHaveFocus()
    fireEvent.click(boton)
    expect(crear).toHaveBeenCalledOnce()
  })
})
