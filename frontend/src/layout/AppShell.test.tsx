import type { Rol, UsuarioSesion } from '@cursus/shared'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { NAV_ITEMS } from '../navigation'
import {
  cerrarSesionDesdeElMenu,
  renderConSesion,
  usuarioDePrueba,
} from '../test/sesion'

const renderApp = renderConSesion
const principal = () =>
  screen.getByRole('navigation', { name: 'Navegación principal' })
const menu = () => screen.getByRole('button', { name: 'Menú' })

describe('navegación por rol', () => {
  test.each<[Rol, [string, string][]]>([
    [
      'DIRECTOR',
      [
        ['Dashboard', '/'],
        ['Indicadores', '/indicadores'],
        ['Registro de accesos', '/accesos'],
        ['Universidades', '/universidades'],
        ['Gestión académica', '/cursos'],
      ],
    ],
    [
      'ADMINISTRATIVO',
      [
        ['Dashboard', '/'],
        ['Reporte académico', '/reporte-facultad'],
        ['Mis Cursos', '/cursos'],
        ['Carreras', '/carreras'],
        ['Períodos', '/periodos'],
        ['Profesores y ayudantes', '/docentes'],
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
    // Cerrar sesión está en el menú de la cuenta, no en el menú lateral.
    expect(
      within(nav).queryByRole('button', { name: /cerrar sesión/i }),
    ).toBeNull()
  })
})

describe('íconos del menú', () => {
  test('todo ítem de NAV_ITEMS declara un ícono y se dibuja', () => {
    for (const item of NAV_ITEMS) {
      expect(item.icon, item.to).toBeDefined()
      const { container, unmount } = render(<item.icon />)
      expect(container.querySelector('svg'), item.to).not.toBeNull()
      unmount()
    }
  })

  test.each<Rol>([
    'DIRECTOR',
    'ADMINISTRATIVO',
    'PROFESOR',
    'AYUDANTE',
    'ALUMNO',
  ])(
    'cada ítem del menú de %s lleva su ícono, oculto al lector de pantalla',
    async (rol) => {
      const nav = await renderApp(rol)
      const enlaces = within(nav).getAllByRole('link')
      expect(enlaces.length).toBeGreaterThan(1)
      for (const enlace of enlaces) {
        const icono = enlace.querySelector('svg')
        expect(icono, enlace.textContent ?? '').not.toBeNull()
        expect(icono).toHaveAttribute('aria-hidden', 'true')
      }
    },
  )
})

describe('egresado (HIS-06)', () => {
  const egresado = (): UsuarioSesion => ({
    ...usuarioDePrueba('ALUMNO'),
    egresado: true,
  })

  test('el menú ofrece solo el historial de notas, con su ícono', async () => {
    const nav = await renderApp('ALUMNO', '/', {
      '/api/auth/yo': egresado,
    })
    const enlaces = within(nav).getAllByRole('link')
    expect(enlaces.map((l) => [l.textContent, l.getAttribute('href')])).toEqual(
      [['Historial de notas', '/mis-cursos/historial']],
    )
    expect(enlaces[0].querySelector('svg')).not.toBeNull()
  })

  test('el menú de la cuenta no tiene Mi perfil, solo Cerrar sesión', async () => {
    await renderApp('ALUMNO', '/', { '/api/auth/yo': egresado })
    await screen.findByRole('heading', { name: 'Historial de notas' })
    const disparador = within(screen.getByRole('banner'))
      .getAllByRole('button')
      .find((b) => b.getAttribute('aria-haspopup') === 'menu')!
    fireEvent.keyDown(disparador, { key: 'Enter' })
    const opciones = within(await screen.findByRole('menu')).getAllByRole(
      'menuitem',
    )
    expect(opciones.map((o) => o.textContent)).toEqual(['Cerrar sesión'])
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

test('Cerrar sesión olvida el token y vuelve a /login', async () => {
  await renderApp('DIRECTOR', '/universidades')
  await cerrarSesionDesdeElMenu()

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

describe('menú contraíble', () => {
  const contraer = () =>
    fireEvent.click(screen.getByRole('button', { name: 'Contraer menú' }))

  test('al contraer quedan los íconos con su nombre accesible y vuelve a expandirse', async () => {
    await renderApp('PROFESOR')
    contraer()

    const boton = screen.getByRole('button', { name: 'Expandir menú' })
    // Los nombres siguen en el árbol de accesibilidad aunque no se vean.
    expect(
      within(principal()).getByRole('link', { name: 'Mis Cursos' }),
    ).toBeInTheDocument()
    expect(within(principal()).getByText('Mis Cursos').className).toContain(
      'sr-only',
    )

    fireEvent.click(boton)
    expect(
      screen.getByRole('button', { name: 'Contraer menú' }),
    ).toBeInTheDocument()
    expect(within(principal()).getByText('Mis Cursos').className).not.toContain(
      'sr-only',
    )
  })

  test('al contraer, el nombre aparece en un tooltip al enfocar el ícono', async () => {
    await renderApp('PROFESOR')
    contraer()

    expect(screen.queryByRole('tooltip')).toBeNull()
    fireEvent.focus(
      within(principal()).getByRole('link', { name: 'Mis Cursos' }),
    )
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Mis Cursos')
  })

  test('sin contraer no hay tooltips', async () => {
    await renderApp('PROFESOR')
    fireEvent.focus(
      within(principal()).getByRole('link', { name: 'Mis Cursos' }),
    )
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  test('se recuerda en este navegador, y solo cuando se cambia', async () => {
    expect(localStorage.length).toBe(0)
    await renderApp('PROFESOR')
    expect(localStorage.length).toBe(0)

    contraer()
    expect(localStorage.getItem('cursus-menu-colapsado')).toBe('1')
  })

  test('arranca contraído si así quedó la última vez', async () => {
    localStorage.setItem('cursus-menu-colapsado', '1')
    await renderApp('PROFESOR')
    expect(
      screen.getByRole('button', { name: 'Expandir menú' }),
    ).toBeInTheDocument()
  })

  test('muestra la universidad y la facultad al pie, solo con el menú expandido', async () => {
    await renderApp('ADMINISTRATIVO')
    const riel = document.getElementById('sidebar')!
    expect(within(riel).getByText('Universidad Demo Norte')).toBeInTheDocument()
    expect(within(riel).getByText('Facultad de Ingeniería')).toBeInTheDocument()

    contraer()
    expect(within(riel).queryByText('Universidad Demo Norte')).toBeNull()
  })
})

describe('panel del menú en pantalla angosta', () => {
  test('el botón del encabezado abre el panel con el mismo menú', async () => {
    await renderApp('ALUMNO')
    // Con el panel abierto, el resto de la página queda oculto al lector de
    // pantalla: el botón se toma antes.
    const boton = menu()
    expect(boton).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(boton)
    const panel = within(await screen.findByRole('dialog', { name: 'Menú' }))
    expect(boton).toHaveAttribute('aria-expanded', 'true')
    expect(
      panel
        .getAllByRole('link')
        .map((l) => [l.textContent, l.getAttribute('href')]),
    ).toEqual([
      ['Dashboard', '/'],
      ['Mis Cursos', '/mis-cursos'],
    ])
    // En el panel el menú siempre va completo: sin botón para contraer.
    expect(
      panel.queryByRole('button', { name: /contraer|expandir/i }),
    ).toBeNull()
  })

  test('se cierra al navegar y con Escape', async () => {
    await renderApp('ALUMNO')

    fireEvent.click(menu())
    const panel = within(await screen.findByRole('dialog', { name: 'Menú' }))
    fireEvent.click(panel.getByRole('link', { name: 'Mis Cursos' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(
      screen.getByRole('heading', { level: 1, name: 'Mis Cursos' }),
    ).toBeInTheDocument()

    fireEvent.click(menu())
    await screen.findByRole('dialog', { name: 'Menú' })
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  test('el panel también lleva el ítem del egresado', async () => {
    await renderApp('ALUMNO', '/', {
      '/api/auth/yo': () => ({ ...usuarioDePrueba('ALUMNO'), egresado: true }),
    })
    fireEvent.click(menu())
    const panel = within(await screen.findByRole('dialog', { name: 'Menú' }))
    expect(panel.getAllByRole('link').map((l) => l.textContent)).toEqual([
      'Historial de notas',
    ])
  })
})
