import type { Rol } from '@cursus/shared'
import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { renderConSesion } from '../test/sesion'

const renderApp = renderConSesion

describe('navegación por rol', () => {
  test.each<[Rol, [string, string][]]>([
    [
      'DIRECTOR',
      [
        ['Dashboard', '/'],
        ['Universidades', '/universidades'],
        ['Gestión académica', '/cursos'],
      ],
    ],
    [
      'ADMINISTRATIVO',
      [
        ['Dashboard', '/'],
        ['Mis Cursos', '/cursos'],
        ['Carreras', '/carreras'],
      ],
    ],
    [
      'PROFESOR',
      [
        ['Dashboard', '/'],
        ['Mis Cursos', '/mis-cursos'],
      ],
    ],
    [
      'AYUDANTE',
      [
        ['Dashboard', '/'],
        ['Mis Cursos', '/mis-cursos'],
      ],
    ],
    [
      'ALUMNO',
      [
        ['Dashboard', '/'],
        ['Mis Cursos', '/mis-cursos'],
      ],
    ],
  ])('%s ve solo sus secciones', async (rol, esperados) => {
    const nav = await renderApp(rol)
    const links = within(nav).getAllByRole('link')

    expect(links.map((l) => [l.textContent, l.getAttribute('href')])).toEqual(
      esperados,
    )
    expect(
      screen.getByRole('button', { name: 'Cerrar Sesión' }),
    ).toBeInTheDocument()
  })
})

test('el ítem activo cambia al navegar', async () => {
  const nav = await renderApp('PROFESOR')
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

test('Cerrar Sesión olvida el token y vuelve a /login', async () => {
  await renderApp('DIRECTOR', '/universidades')
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar Sesión' }))

  expect(
    await screen.findByRole('heading', {
      level: 1,
      name: 'Bienvenido a CURSUS',
    }),
  ).toBeInTheDocument()
  expect(
    screen.queryByRole('navigation', { name: 'Navegación principal' }),
  ).not.toBeInTheDocument()
})

describe('menú en pantalla angosta', () => {
  const menuButton = () => screen.getByRole('button', { name: 'Menú' })
  const sidebar = () => document.getElementById('sidebar')

  test('el botón abre y cierra el menú', async () => {
    await renderApp('ALUMNO')
    expect(menuButton()).toHaveAttribute('aria-expanded', 'false')
    expect(sidebar()).toHaveAttribute('data-open', 'false')

    fireEvent.click(menuButton())
    expect(menuButton()).toHaveAttribute('aria-expanded', 'true')
    expect(sidebar()).toHaveAttribute('data-open', 'true')

    fireEvent.click(menuButton())
    expect(menuButton()).toHaveAttribute('aria-expanded', 'false')
  })

  test('se cierra al navegar, con clic fuera y con Escape', async () => {
    await renderApp('ALUMNO')

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
