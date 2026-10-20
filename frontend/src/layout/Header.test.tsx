import type { Rol } from '@cursus/shared'
import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import {
  renderApp as renderSinEsperar,
  renderConSesion,
  simularBackend,
  usuarioDePrueba,
} from '../test/sesion'

async function renderApp(rol: Rol, path = '/') {
  // /cursos pide el listado; sin cursos basta para revisar el encabezado.
  await renderConSesion(rol, path, { '/api/cursos': () => [] })
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
    async (rol, nombre, rolLabel, titulo, subtitulo) => {
      const header = within(await renderApp(rol))

      expect(header.getByRole('heading', { level: 1 })).toHaveTextContent(
        titulo,
      )
      expect(header.getByText(subtitulo)).toBeInTheDocument()
      expect(header.getByText(nombre)).toBeInTheDocument()
      expect(header.getByText(rolLabel)).toBeInTheDocument()
    },
  )

  test('muestra las iniciales del usuario en el avatar', async () => {
    const header = within(await renderApp('DIRECTOR'))
    expect(header.getByText('DN')).toBeInTheDocument()
  })

  test('no duplica Cerrar Sesión, que está en el Sidebar', async () => {
    const header = within(await renderApp('ALUMNO'))
    expect(header.queryByRole('button')).not.toBeInTheDocument()
  })
})

describe('título por ruta', () => {
  test('cambia al navegar entre rutas', async () => {
    await renderApp('PROFESOR')
    const titulo = () => screen.getByRole('heading', { level: 1 })

    expect(titulo()).toHaveTextContent('Bienvenido/a, Profesor Norte')

    fireEvent.click(screen.getByRole('link', { name: 'Mis Cursos' }))
    expect(titulo()).toHaveTextContent('Mis Cursos')

    fireEvent.click(screen.getByRole('link', { name: 'Dashboard' }))
    expect(titulo()).toHaveTextContent('Bienvenido/a, Profesor Norte')
  })

  test('el Administrativo ve su facultad en Gestión académica', async () => {
    const header = within(await renderApp('ADMINISTRATIVO', '/cursos'))

    expect(header.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Gestión académica',
    )
    expect(
      header.getByText('Facultad de Ingeniería · Semestre 2026-2'),
    ).toBeInTheDocument()
  })

  test('el Director ve Universidades', async () => {
    const header = within(await renderApp('DIRECTOR', '/universidades'))

    expect(header.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Universidades',
    )
    expect(header.getByText('Directorio · Semestre 2026-2')).toBeInTheDocument()
  })
})

test('sin período activo, el subtítulo muestra solo la universidad', async () => {
  const fetch = simularBackend('ALUMNO')
  fetch.mockImplementation(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({ ...usuarioDePrueba('ALUMNO'), periodoActivo: null }),
      ),
    ),
  )
  renderSinEsperar('/', 'jwt-de-prueba')

  const header = within(await screen.findByRole('banner'))
  expect(header.getByText('Universidad Demo Norte')).toBeInTheDocument()
})

test('un nombre con HTML se muestra como texto y no crea un <script>', async () => {
  const nombre = '<script>alert(1)</script>'
  const fetch = simularBackend('ALUMNO')
  fetch.mockImplementation(() =>
    Promise.resolve(
      new Response(JSON.stringify({ ...usuarioDePrueba('ALUMNO'), nombre })),
    ),
  )
  renderSinEsperar('/', 'jwt-de-prueba')

  const banner = await screen.findByRole('banner')
  expect(within(banner).getByRole('heading', { level: 1 })).toHaveTextContent(
    `Bienvenido/a, ${nombre}`,
  )
  expect(within(banner).getByText(nombre)).toBeInTheDocument()
  expect(document.querySelector('script')).toBeNull()
})
