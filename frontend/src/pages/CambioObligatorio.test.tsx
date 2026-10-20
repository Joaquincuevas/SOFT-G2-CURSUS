import { fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  json,
  renderApp,
  simularBackend,
  usuarioDePrueba,
} from '../test/sesion'

afterEach(() => {
  vi.unstubAllGlobals()
})

const PROVISORIO = { ...usuarioDePrueba('ALUMNO'), debeCambiarPassword: true }

const campo = (nombre: string) =>
  screen.getByLabelText(nombre) as HTMLInputElement

// Sesión iniciada de un alumno con la contraseña provisoria.
function renderProvisorio(path: string, rutas = {}) {
  const fetch = simularBackend('ALUMNO', {
    '/api/auth/yo': () => PROVISORIO,
    ...rutas,
  })
  renderApp(path, 'jwt-de-prueba')
  return fetch
}

describe('cambio obligatorio de contraseña (PER-03)', () => {
  test.each(['/', '/perfil', '/mis-cursos'])(
    'con la contraseña provisoria, %s lleva a la pantalla de cambio sin menú',
    async (path) => {
      renderProvisorio(path)

      expect(
        await screen.findByRole('heading', { name: 'Cambia tu contraseña' }),
      ).toBeInTheDocument()
      expect(
        screen.queryByRole('navigation', { name: 'Navegación principal' }),
      ).not.toBeInTheDocument()
    },
  )

  test('al cambiarla entra al dashboard con el menú', async () => {
    const pedidos: unknown[] = []
    renderProvisorio('/', {
      '/api/auth/password': (init?: RequestInit) => {
        pedidos.push(JSON.parse(String(init?.body)))
        return new Response(null, { status: 204 })
      },
    })
    await screen.findByRole('heading', { name: 'Cambia tu contraseña' })

    fireEvent.change(campo('Contraseña provisoria'), {
      target: { value: 'ABCD2345EFGH6789' },
    })
    fireEvent.change(campo('Contraseña nueva'), {
      target: { value: 'contraseña-nueva' },
    })
    fireEvent.change(campo('Repetir contraseña nueva'), {
      target: { value: 'contraseña-nueva' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }))

    expect(
      await screen.findByRole('navigation', { name: 'Navegación principal' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Cambia tu contraseña' }),
    ).not.toBeInTheDocument()
    expect(pedidos).toEqual([
      { passwordActual: 'ABCD2345EFGH6789', passwordNueva: 'contraseña-nueva' },
    ])
  })

  test('si la provisoria no es correcta, muestra el error y sigue en la pantalla', async () => {
    renderProvisorio('/', {
      '/api/auth/password': () =>
        json({ message: 'La contraseña actual no es correcta' }, 400),
    })
    await screen.findByRole('heading', { name: 'Cambia tu contraseña' })

    fireEvent.change(campo('Contraseña provisoria'), {
      target: { value: 'no-es-la-provisoria' },
    })
    fireEvent.change(campo('Contraseña nueva'), {
      target: { value: 'contraseña-nueva' },
    })
    fireEvent.change(campo('Repetir contraseña nueva'), {
      target: { value: 'contraseña-nueva' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'La contraseña actual no es correcta.',
    )
    expect(
      screen.getByRole('heading', { name: 'Cambia tu contraseña' }),
    ).toBeInTheDocument()
  })

  test('puede cerrar sesión desde la pantalla', async () => {
    renderProvisorio('/')
    await screen.findByRole('heading', { name: 'Cambia tu contraseña' })

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))

    expect(
      await screen.findByRole('heading', { name: 'Bienvenido a CURSUS' }),
    ).toBeInTheDocument()
  })

  test('sin la contraseña provisoria, la pantalla de cambio lleva al dashboard', async () => {
    simularBackend('ALUMNO')
    renderApp('/cambiar-password', 'jwt-de-prueba')

    expect(
      await screen.findByRole('navigation', { name: 'Navegación principal' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Cambia tu contraseña' }),
    ).not.toBeInTheDocument()
  })
})
