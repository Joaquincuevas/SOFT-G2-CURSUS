import { definirAbilityPara, type Rol } from '@cursus/shared'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { SessionContext, usePuede } from '../session/session'
import { renderConSesion, usuarioDePrueba } from '../test/sesion'

const titulo = () => screen.getByRole('heading', { level: 1 })

describe('cada rol llega a su Dashboard', () => {
  test.each<[Rol, string]>([
    ['DIRECTOR', 'Visión del Directorio'],
    ['ADMINISTRATIVO', 'Bienvenido/a, Administrativo Ingeniería Norte'],
    ['PROFESOR', 'Bienvenido/a, Profesor Norte'],
    ['AYUDANTE', 'Bienvenido/a, Ayudante Norte'],
    ['ALUMNO', 'Bienvenido/a, Alumno Norte'],
  ])('%s en / ve "%s"', async (rol, esperado) => {
    await renderConSesion(rol)
    expect(titulo()).toHaveTextContent(esperado)
    expect(
      screen.getByRole('region', { name: 'Dashboard' }),
    ).toBeInTheDocument()
  })
})

describe('una ruta de otro rol redirige al Dashboard', () => {
  test.each<[Rol, string]>([
    ['DIRECTOR', '/mis-cursos'],
    ['ADMINISTRATIVO', '/universidades'],
    ['ADMINISTRATIVO', '/mis-cursos'],
    ['PROFESOR', '/cursos'],
    ['AYUDANTE', '/universidades'],
    ['ALUMNO', '/cursos'],
    // Las subrutas heredan el permiso de su ítem.
    ['ALUMNO', '/cursos/123'],
  ])('%s en %s', async (rol, path) => {
    const nav = await renderConSesion(rol, path)
    // <Navigate> redirige en un efecto, después de que aparece el menú.
    expect(
      await screen.findByRole('region', { name: 'Dashboard' }),
    ).toBeInTheDocument()
    expect(
      within(nav).getByRole('link', { name: 'Dashboard' }),
    ).toHaveAttribute('aria-current', 'page')
  })

  test('una ruta que no existe también vuelve al Dashboard', async () => {
    await renderConSesion('PROFESOR', '/no-existe')
    await screen.findByRole('region', { name: 'Dashboard' })
    expect(titulo()).toHaveTextContent('Bienvenido/a, Profesor Norte')
  })
})

test('el Director entra a Gestión académica en solo lectura', async () => {
  await renderConSesion('DIRECTOR', '/cursos')
  expect(titulo()).toHaveTextContent('Gestión académica')
  expect(screen.getByText('Directorio · Semestre 2026-2')).toBeInTheDocument()
})

describe('usePuede', () => {
  function BotonCrear() {
    return usePuede('create', 'Curso') ? <button>Crear curso</button> : null
  }

  function renderBoton(rol: Rol) {
    const user = usuarioDePrueba(rol)
    render(
      <SessionContext value={{ user, ability: definirAbilityPara(user) }}>
        <BotonCrear />
      </SessionContext>,
    )
  }

  test('el Administrativo ve la acción de crear', () => {
    renderBoton('ADMINISTRATIVO')
    expect(
      screen.getByRole('button', { name: 'Crear curso' }),
    ).toBeInTheDocument()
  })

  test.each<Rol>(['DIRECTOR', 'PROFESOR'])('%s no la ve', (rol) => {
    renderBoton(rol)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
