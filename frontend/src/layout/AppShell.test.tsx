import type { Rol } from '@cursus/shared'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, test } from 'vitest'
import App from '../App'
import { SessionProvider } from '../session/SessionProvider'

function renderApp(rol: Rol, path = '/') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <SessionProvider initialRol={rol}>
        <App />
      </SessionProvider>
    </MemoryRouter>,
  )
  return screen.getByRole('navigation', { name: 'Navegación principal' })
}

describe('navegación por rol', () => {
  test.each<[Rol, string]>([
    ['DIRECTOR', '/universidades'],
    ['ADMINISTRATIVO', '/cursos'],
    ['PROFESOR', '/mis-cursos'],
    ['AYUDANTE', '/mis-cursos'],
    ['ALUMNO', '/mis-cursos'],
  ])('%s ve Dashboard y Mis Cursos → %s', (rol, misCursos) => {
    const nav = renderApp(rol)
    const links = within(nav).getAllByRole('link')

    expect(links.map((l) => l.textContent)).toEqual(['Dashboard', 'Mis Cursos'])
    expect(links[0]).toHaveAttribute('href', '/')
    expect(links[1]).toHaveAttribute('href', misCursos)
    expect(
      screen.getByRole('button', { name: 'Cerrar Sesión' }),
    ).toBeInTheDocument()
  })
})

test('el ítem activo cambia al navegar', () => {
  const nav = renderApp('PROFESOR')
  const dashboard = within(nav).getByRole('link', { name: 'Dashboard' })
  const misCursos = within(nav).getByRole('link', { name: 'Mis Cursos' })

  expect(dashboard).toHaveAttribute('aria-current', 'page')
  expect(misCursos).not.toHaveAttribute('aria-current')

  fireEvent.click(misCursos)

  expect(misCursos).toHaveAttribute('aria-current', 'page')
  expect(dashboard).not.toHaveAttribute('aria-current')
  expect(
    screen.getByRole('heading', { level: 1, name: 'Mis Cursos' }),
  ).toBeInTheDocument()
})

test('Cerrar Sesión vuelve al rol por defecto y a /', () => {
  renderApp('DIRECTOR', '/universidades')
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar Sesión' }))

  expect(screen.getByRole('link', { name: 'Mis Cursos' })).toHaveAttribute(
    'href',
    '/mis-cursos',
  )
  expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
    'aria-current',
    'page',
  )
})

describe('menú en pantalla angosta', () => {
  const menuButton = () => screen.getByRole('button', { name: 'Menú' })
  const sidebar = () => document.getElementById('sidebar')

  test('el botón abre y cierra el menú', () => {
    renderApp('ALUMNO')
    expect(menuButton()).toHaveAttribute('aria-expanded', 'false')
    expect(sidebar()).toHaveAttribute('data-open', 'false')

    fireEvent.click(menuButton())
    expect(menuButton()).toHaveAttribute('aria-expanded', 'true')
    expect(sidebar()).toHaveAttribute('data-open', 'true')

    fireEvent.click(menuButton())
    expect(menuButton()).toHaveAttribute('aria-expanded', 'false')
  })

  test('se cierra al navegar, con clic fuera y con Escape', () => {
    renderApp('ALUMNO')

    fireEvent.click(menuButton())
    fireEvent.click(screen.getByRole('link', { name: 'Mis Cursos' }))
    expect(menuButton()).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(menuButton())
    fireEvent.click(screen.getByTestId('menu-backdrop'))
    expect(menuButton()).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(menuButton())
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(menuButton()).toHaveAttribute('aria-expanded', 'false')
  })
})
