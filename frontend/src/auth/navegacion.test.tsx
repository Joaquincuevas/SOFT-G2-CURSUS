import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation, useNavigate } from 'react-router'
import { describe, expect, test } from 'vitest'
import { AuthProvider } from './AuthProvider'
import { useAuth, type AuthValue } from './auth'

// Cada render guarda las funciones de la sesión que recibió.
const vistas: Pick<AuthValue, 'fetchConSesion' | 'cerrarSesion'>[] = []

function Navegador() {
  const { fetchConSesion, cerrarSesion } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  vistas.push({ fetchConSesion, cerrarSesion })
  return (
    <>
      <p>{pathname}</p>
      <button onClick={() => navigate('/cursos')}>Cursos</button>
      <button onClick={() => navigate('/cursos/nuevo')}>Nuevo</button>
    </>
  )
}

describe('funciones de la sesión al navegar', () => {
  test('fetchConSesion y cerrarSesion no cambian, así los efectos que las usan no repiten sus pedidos', () => {
    vistas.length = 0
    render(
      <MemoryRouter initialEntries={['/']}>
        <AuthProvider initialToken="jwt">
          <Navegador />
        </AuthProvider>
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByText('Cursos'))
    expect(screen.getByText('/cursos')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Nuevo'))
    expect(screen.getByText('/cursos/nuevo')).toBeInTheDocument()

    // Se navegó dos veces, así que hubo al menos tres renders.
    expect(vistas.length).toBeGreaterThanOrEqual(3)
    const [primera] = vistas
    for (const vista of vistas) {
      expect(vista.fetchConSesion).toBe(primera.fetchConSesion)
      expect(vista.cerrarSesion).toBe(primera.cerrarSesion)
    }
  })
})
