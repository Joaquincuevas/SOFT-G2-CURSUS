import type { Rol, UsuarioSesion } from '@cursus/shared'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { ROL_LABEL } from '../session/roles'
import {
  abrirMenuUsuario,
  cerrarSesionDesdeElMenu,
  renderConSesion,
  usuarioDePrueba,
} from '../test/sesion'

// UIX-04: el menú de la cuenta del encabezado. Los colores y el contraste
// están en contraste-color.test.ts.
async function cuenta(rol: Rol = 'PROFESOR', usuario?: Partial<UsuarioSesion>) {
  await renderConSesion(
    rol,
    '/',
    usuario
      ? { '/api/auth/yo': () => ({ ...usuarioDePrueba(rol), ...usuario }) }
      : {},
  )
  const encabezado = await screen.findByRole('banner')
  return within(encabezado)
    .getAllByRole('button')
    .find((boton) => boton.getAttribute('aria-haspopup') === 'menu')!
}

describe('disparador', () => {
  test('lleva el avatar con las iniciales y el nombre truncado con el nombre completo en title', async () => {
    const disparador = await cuenta('PROFESOR', {
      nombre: 'Profesora Con Un Nombre Muy Largo Apellido',
    })
    expect(within(disparador).getByText('PC')).toBeInTheDocument()
    const nombre = within(disparador).getByText(
      'Profesora Con Un Nombre Muy Largo Apellido',
    )
    expect(nombre).toHaveClass('truncate')
    expect(nombre).toHaveAttribute(
      'title',
      'Profesora Con Un Nombre Muy Largo Apellido',
    )
  })

  test('el rol va en una línea secundaria más pequeña que el nombre', async () => {
    const disparador = await cuenta('AYUDANTE')
    const nombre = within(disparador).getByText('Ayudante Norte')
    const rol = within(disparador).getByText('Ayudante')
    expect(nombre).toHaveClass('text-sm')
    expect(rol).toHaveClass('text-xs')
  })

  test('bajo 768 px quedan solo el avatar y el chevron; el nombre sigue siendo el nombre accesible', async () => {
    const disparador = await cuenta('ALUMNO')
    expect(within(disparador).getByText('AN')).toBeInTheDocument()
    expect(
      within(disparador).getByText('Alumno Norte').parentElement,
    ).toHaveClass('max-md:sr-only')
    // El chevron es el único svg que no es el avatar y no se oculta.
    const chevron = disparador.querySelector('svg')!
    expect(chevron.getAttribute('class')).not.toMatch(/hidden/)
    expect(disparador).toHaveAccessibleName(/Alumno Norte/)
  })

  test('el área táctil mide 44 px como mínimo', async () => {
    const disparador = await cuenta()
    expect(disparador).toHaveClass('min-h-11', 'min-w-11')
  })

  test('el chevron gira 180° con el menú abierto y se detiene si se pide menos movimiento', async () => {
    const disparador = await cuenta()
    const chevron = disparador.querySelector('svg')!
    expect(disparador).toHaveClass('group')
    expect(chevron).toHaveClass('group-data-[state=open]:rotate-180')
    expect(chevron).toHaveClass('motion-reduce:transition-none')
    expect(disparador).toHaveAttribute('data-state', 'closed')
    await abrirMenuUsuario()
    expect(disparador).toHaveAttribute('data-state', 'open')
  })
})

describe('panel', () => {
  test('abre con la cabecera: avatar, nombre completo, correo, rol en un Badge y la universidad con su punto', async () => {
    await cuenta('PROFESOR', {
      nombre: 'Profesora Con Un Nombre Muy Largo Apellido',
    })
    const menu = within(await abrirMenuUsuario())

    expect(menu.getByText('PC')).toBeInTheDocument()
    // Sin truncar: puede ocupar dos líneas.
    const nombre = menu.getByText('Profesora Con Un Nombre Muy Largo Apellido')
    expect(nombre).not.toHaveClass('truncate')
    expect(nombre).toHaveClass('break-words')
    expect(menu.getByText('profesor@norte.cursus.test')).toBeInTheDocument()
    const rol = menu.getByText('Profesor')
    expect(rol).toHaveAttribute('data-slot', 'badge')
    const universidad = menu.getByText('Universidad Demo Norte')
    const punto = universidad.querySelector('[aria-hidden="true"]')
    expect(punto).toHaveClass('rounded-full', 'bg-primary')
  })

  test('mide 280 px como mínimo y se alinea al final del disparador', async () => {
    await cuenta()
    const menu = await abrirMenuUsuario()
    expect(menu).toHaveClass('min-w-70')
    expect(menu).toHaveAttribute('data-align', 'end')
  })

  test('orden: cabecera, separador, Mi perfil, separador y Cerrar sesión aparte', async () => {
    await cuenta()
    const menu = within(await abrirMenuUsuario())

    expect(
      menu.getAllByRole('separator').map((s) => s.getAttribute('data-slot')),
    ).toHaveLength(2)
    const grupos = menu.getAllByRole('group')
    expect(grupos).toHaveLength(2)
    expect(
      within(grupos[0]).getByRole('menuitem', { name: 'Mi perfil' }),
    ).toHaveAttribute('href', '/perfil')
    expect(
      within(grupos[1]).getByRole('menuitem', { name: 'Cerrar sesión' }),
    ).toBeInTheDocument()
    expect(menu.getAllByRole('menuitem')).toHaveLength(2)
  })

  test('Cerrar sesión va en el color de peligro, con su ícono, y las filas miden 44 px y tienen aro de foco', async () => {
    await cuenta()
    const menu = within(await abrirMenuUsuario())
    const salir = menu.getByRole('menuitem', { name: 'Cerrar sesión' })
    expect(salir).toHaveAttribute('data-variant', 'destructive')
    expect(salir.querySelector('svg')).not.toBeNull()
    for (const fila of menu.getAllByRole('menuitem')) {
      expect(fila).toHaveClass('min-h-11', 'focus-visible:ring-2')
      // Hover y foco: el tinte de la universidad (--accent) o, para salir, el
      // del color de peligro.
      expect(fila.className).toMatch(/focus:bg-accent|focus:bg-destructive/)
    }
    expect(
      menu.getByRole('menuitem', { name: 'Mi perfil' }).querySelector('svg'),
    ).not.toBeNull()
  })

  test.each<Rol>([
    'DIRECTOR',
    'ADMINISTRATIVO',
    'PROFESOR',
    'AYUDANTE',
    'ALUMNO',
  ])('%s ve su rol en el Badge y Mi perfil', async (rol) => {
    await cuenta(rol)
    const menu = within(await abrirMenuUsuario())
    expect(menu.getByText(ROL_LABEL[rol]).getAttribute('data-slot')).toBe(
      'badge',
    )
    expect(menu.getByRole('menuitem', { name: 'Mi perfil' })).toBeVisible()
  })

  test('el egresado ve Egresado, sin Mi perfil y con un solo separador', async () => {
    await cuenta('ALUMNO', { egresado: true })
    const menu = within(await abrirMenuUsuario())
    expect(menu.getByText('Egresado').getAttribute('data-slot')).toBe('badge')
    expect(menu.queryByRole('menuitem', { name: 'Mi perfil' })).toBeNull()
    expect(menu.getAllByRole('separator')).toHaveLength(1)
    expect(menu.getAllByRole('menuitem')).toHaveLength(1)
  })
})

describe('teclado', () => {
  const foco = () => document.activeElement as HTMLElement
  // Radix mueve el foco entre las filas en un setTimeout.
  const enfocado = (nombre: string) =>
    waitFor(() => expect(foco()).toHaveAccessibleName(nombre))

  test('la flecha abajo abre el menú desde el disparador', async () => {
    const disparador = await cuenta()
    fireEvent.keyDown(disparador, { key: 'ArrowDown' })
    expect(await screen.findByRole('menu')).toBeInTheDocument()
    expect(disparador).toHaveAttribute('aria-expanded', 'true')
  })

  test('las flechas, Inicio y Fin recorren Mi perfil y Cerrar sesión', async () => {
    await cuenta()
    const menu = await abrirMenuUsuario()

    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    await enfocado('Mi perfil')
    fireEvent.keyDown(foco(), { key: 'ArrowDown' })
    await enfocado('Cerrar sesión')
    fireEvent.keyDown(foco(), { key: 'ArrowUp' })
    await enfocado('Mi perfil')
    fireEvent.keyDown(foco(), { key: 'End' })
    await enfocado('Cerrar sesión')
    fireEvent.keyDown(foco(), { key: 'Home' })
    await enfocado('Mi perfil')
  })

  test('Enter en Mi perfil lleva al perfil y cierra el menú', async () => {
    await cuenta()
    const menu = await abrirMenuUsuario()
    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    await enfocado('Mi perfil')
    fireEvent.keyDown(foco(), { key: 'Enter' })

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Mi perfil' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('menu')).toBeNull()
  })

  test('Escape cierra el menú y el foco vuelve al disparador', async () => {
    const disparador = await cuenta()
    const menu = await abrirMenuUsuario()
    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    await enfocado('Mi perfil')
    fireEvent.keyDown(foco(), { key: 'Escape' })

    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    await waitFor(() => expect(disparador).toHaveFocus())
    expect(disparador).toHaveAttribute('aria-expanded', 'false')
  })
})

describe('cerrar sesión', () => {
  test('con el mouse pide el logout y vuelve al acceso', async () => {
    await cuenta()
    await cerrarSesionDesdeElMenu()
    expect(
      await screen.findByRole('heading', { name: 'Bienvenido a CURSUS' }),
    ).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' })
  })

  test('con Enter sobre la fila también', async () => {
    await cuenta()
    const menu = await abrirMenuUsuario()
    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    await waitFor(() =>
      expect(document.activeElement).toHaveAccessibleName('Mi perfil'),
    )
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    await waitFor(() =>
      expect(document.activeElement).toHaveAccessibleName('Cerrar sesión'),
    )
    fireEvent.keyDown(document.activeElement!, { key: 'Enter' })
    expect(
      await screen.findByRole('heading', { name: 'Bienvenido a CURSUS' }),
    ).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' })
  })
})
