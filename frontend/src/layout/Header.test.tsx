import type { Rol } from '@cursus/shared'
import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import {
  abrirMenuUsuario,
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
  test.each<[Rol, string, string, string]>([
    ['DIRECTOR', 'Director Norte', 'Director', 'Visión del Directorio'],
    [
      'ADMINISTRATIVO',
      'Administrativo Ingeniería Norte',
      'Administrativo',
      'Bienvenido/a, Administrativo Ingeniería Norte',
    ],
    ['PROFESOR', 'Profesor Norte', 'Profesor', 'Bienvenido/a, Profesor Norte'],
    ['AYUDANTE', 'Ayudante Norte', 'Ayudante', 'Bienvenido/a, Ayudante Norte'],
    ['ALUMNO', 'Alumno Norte', 'Alumno', 'Bienvenido/a, Alumno Norte'],
  ])(
    '%s ve su nombre, su rol, el semestre y el título',
    async (rol, nombre, rolLabel, titulo) => {
      const header = within(await renderApp(rol))

      expect(header.getByRole('heading', { level: 1 })).toHaveTextContent(
        titulo,
      )
      expect(header.getByText(nombre)).toBeInTheDocument()
      expect(header.getByText(rolLabel)).toBeInTheDocument()
      expect(header.getByText('Semestre 2026-2')).toBeInTheDocument()
    },
  )

  test('no repite el título como subtítulo: un solo encabezado, sin la universidad', async () => {
    const header = within(await renderApp('PROFESOR'))
    expect(header.getAllByRole('heading')).toHaveLength(1)
    expect(header.queryByText(/Universidad Demo Norte/)).toBeNull()
  })

  test('muestra las iniciales del usuario en el avatar', async () => {
    const header = within(await renderApp('DIRECTOR'))
    expect(header.getByText('DN')).toBeInTheDocument()
  })

  test('Cerrar sesión no está a la vista: solo dentro del menú de la cuenta', async () => {
    const header = within(await renderApp('ALUMNO'))
    expect(header.queryByRole('button', { name: /cerrar sesión/i })).toBeNull()
    expect(screen.queryByRole('menuitem')).toBeNull()
  })
})

describe('menú de la cuenta', () => {
  test('abre con nombre, rol y universidad, el perfil y Cerrar sesión', async () => {
    await renderApp('PROFESOR')
    const menu = within(await abrirMenuUsuario())

    expect(menu.getByText('Profesor Norte')).toBeInTheDocument()
    expect(menu.getByText('Profesor')).toBeInTheDocument()
    expect(menu.getByText('Universidad Demo Norte')).toBeInTheDocument()
    expect(menu.getByRole('menuitem', { name: 'Mi perfil' })).toHaveAttribute(
      'href',
      '/perfil',
    )
    expect(
      menu.getByRole('menuitem', { name: 'Cerrar sesión' }),
    ).toBeInTheDocument()
  })

  test('el disparador anuncia un menú y su estado', async () => {
    await renderApp('ALUMNO')
    const disparador = within(screen.getByRole('banner'))
      .getAllByRole('button')
      .find((b) => b.getAttribute('aria-haspopup') === 'menu')!
    expect(disparador).toHaveAttribute('aria-expanded', 'false')
    await abrirMenuUsuario()
    expect(disparador).toHaveAttribute('aria-expanded', 'true')
  })

  test('Escape cierra el menú', async () => {
    await renderApp('ALUMNO')
    await abrirMenuUsuario()
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
  })
})

describe('breadcrumb', () => {
  test('el Dashboard no lleva camino: solo su título', async () => {
    const header = within(await renderApp('PROFESOR'))
    expect(header.queryByRole('navigation')).toBeNull()
  })

  test('cambia al navegar: Inicio como enlace y la ruta actual como título', async () => {
    await renderApp('PROFESOR')
    const titulo = () => screen.getByRole('heading', { level: 1 })
    expect(titulo()).toHaveTextContent('Bienvenido/a, Profesor Norte')

    fireEvent.click(
      within(
        screen.getByRole('navigation', { name: 'Navegación principal' }),
      ).getByRole('link', { name: 'Mis Cursos' }),
    )
    expect(titulo()).toHaveTextContent('Mis Cursos')
    const camino = within(screen.getByRole('navigation', { name: 'Ubicación' }))
    expect(camino.getByRole('link', { name: 'Inicio' })).toHaveAttribute(
      'href',
      '/',
    )
    // La ruta actual es el h1 y no es un enlace.
    expect(camino.queryByRole('link', { name: 'Mis Cursos' })).toBeNull()
    expect(within(titulo()).getByText('Mis Cursos')).toHaveAttribute(
      'aria-current',
      'page',
    )

    fireEvent.click(camino.getByRole('link', { name: 'Inicio' }))
    expect(titulo()).toHaveTextContent('Bienvenido/a, Profesor Norte')
    expect(screen.queryByRole('navigation', { name: 'Ubicación' })).toBeNull()
  })

  test('el Administrativo ve Gestión académica', async () => {
    const header = within(await renderApp('ADMINISTRATIVO', '/cursos'))
    expect(header.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Gestión académica',
    )
  })

  test('el Director ve Universidades', async () => {
    const header = within(await renderApp('DIRECTOR', '/universidades'))
    expect(header.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Universidades',
    )
  })

  test('una ruta que no existe se llama Página no encontrada', async () => {
    const header = within(await renderApp('PROFESOR', '/no-existe'))
    expect(header.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Página no encontrada',
    )
  })

  test('en la sección de un curso, el último paso es su código y número', async () => {
    await renderConSesion('PROFESOR', '/mis-cursos/secciones/seccion-1', {
      '/api/espacio/secciones/seccion-1/resumen': () => ({
        id: 'seccion-1',
        numero: 2,
        curso: { id: 'c', codigo: 'ICC101', nombre: 'Programación' },
        periodo: { id: 'p', anio: 2026, semestre: 2 },
        rol: 'PROFESOR',
        horario: [],
        profesor: null,
        profesores: [],
        ayudantes: [],
      }),
    })
    const header = within(screen.getByRole('banner'))
    expect(await header.findByRole('heading', { level: 1 })).toHaveTextContent(
      'ICC101 · Sección 2',
    )
    expect(header.getByRole('link', { name: 'Inicio' })).toHaveAttribute(
      'href',
      '/',
    )
  })
})

test('sin período activo no muestra el semestre', async () => {
  simularBackend('ALUMNO', {
    '/api/auth/yo': () => ({
      ...usuarioDePrueba('ALUMNO'),
      periodoActivo: null,
    }),
  })
  renderSinEsperar('/', 'jwt-de-prueba')

  await screen.findByText('No tienes inscripciones en el período activo.')

  const header = within(await screen.findByRole('banner'))
  expect(header.queryByText(/Semestre/)).toBeNull()
})

test('un nombre con HTML se muestra como texto y no crea un <script>', async () => {
  const nombre = '<script>alert(1)</script>'
  simularBackend('ALUMNO', {
    '/api/auth/yo': () => ({ ...usuarioDePrueba('ALUMNO'), nombre }),
  })
  renderSinEsperar('/', 'jwt-de-prueba')

  await screen.findByText('No tienes inscripciones en el período activo.')

  const banner = await screen.findByRole('banner')
  expect(within(banner).getByRole('heading', { level: 1 })).toHaveTextContent(
    `Bienvenido/a, ${nombre}`,
  )
  expect(within(banner).getByText(nombre)).toBeInTheDocument()
  expect(document.querySelector('script')).toBeNull()
})
