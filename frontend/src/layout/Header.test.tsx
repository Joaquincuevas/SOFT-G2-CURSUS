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
  return screen.getByRole('banner')
}

describe('encabezado por rol', () => {
  test.each<[Rol, string, string, string, string]>([
    [
      'DIRECTOR',
      'Director Norte',
      'Director',
      'Visión del Directorio',
      'Directorio · Semestre 2026-2',
    ],
    [
      'ADMINISTRATIVO',
      'Administrativo Ingeniería Norte',
      'Administrativo',
      'Bienvenido/a, Administrativo Ingeniería Norte',
      'Universidad Demo Norte · Semestre 2026-2',
    ],
    [
      'PROFESOR',
      'Profesor Norte',
      'Profesor',
      'Bienvenido/a, Profesor Norte',
      'Universidad Demo Norte · Semestre 2026-2',
    ],
    [
      'AYUDANTE',
      'Ayudante Norte',
      'Ayudante',
      'Bienvenido/a, Ayudante Norte',
      'Universidad Demo Norte · Semestre 2026-2',
    ],
    [
      'ALUMNO',
      'Alumno Norte',
      'Alumno',
      'Bienvenido/a, Alumno Norte',
      'Universidad Demo Norte · Semestre 2026-2',
    ],
  ])(
    '%s ve su nombre, rol y universidad',
    (rol, nombre, rolLabel, titulo, subtitulo) => {
      const header = within(renderApp(rol))

      expect(header.getByRole('heading', { level: 1 })).toHaveTextContent(
        titulo,
      )
      expect(header.getByText(subtitulo)).toBeInTheDocument()
      expect(header.getByText(nombre)).toBeInTheDocument()
      expect(header.getByText(rolLabel)).toBeInTheDocument()
    },
  )

  test('muestra las iniciales del usuario en el avatar', () => {
    const header = within(renderApp('DIRECTOR'))
    expect(header.getByText('DN')).toBeInTheDocument()
  })

  test('no duplica Cerrar Sesión, que está en el Sidebar', () => {
    const header = within(renderApp('ALUMNO'))
    expect(header.queryByRole('button')).not.toBeInTheDocument()
  })
})

describe('título por ruta', () => {
  test('cambia al navegar entre rutas', () => {
    renderApp('PROFESOR')
    const titulo = () => screen.getByRole('heading', { level: 1 })

    expect(titulo()).toHaveTextContent('Bienvenido/a, Profesor Norte')

    fireEvent.click(screen.getByRole('link', { name: 'Mis Cursos' }))
    expect(titulo()).toHaveTextContent('Mis Cursos')

    fireEvent.click(screen.getByRole('link', { name: 'Dashboard' }))
    expect(titulo()).toHaveTextContent('Bienvenido/a, Profesor Norte')
  })

  test('el Administrativo ve su facultad en Gestión académica', () => {
    const header = within(renderApp('ADMINISTRATIVO', '/cursos'))

    expect(header.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Gestión académica',
    )
    expect(
      header.getByText('Facultad de Ingeniería · Semestre 2026-2'),
    ).toBeInTheDocument()
  })

  test('el Director ve Universidades en Mis Cursos', () => {
    const header = within(renderApp('DIRECTOR', '/universidades'))

    expect(header.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Universidades',
    )
    expect(header.getByText('Directorio · Semestre 2026-2')).toBeInTheDocument()
  })
})
