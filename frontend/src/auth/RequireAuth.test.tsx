import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { renderApp, simularBackend } from '../test/sesion'

function enviarLogin(correo: string, password: string) {
  fireEvent.change(screen.getByLabelText('Correo institucional'), {
    target: { value: correo },
  })
  fireEvent.change(screen.getByLabelText('Contraseña'), {
    target: { value: password },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }))
}

// Sin token, la app primero intenta restaurar la sesión con la cookie.
const pantallaLogin = () =>
  screen.findByRole('heading', { level: 1, name: 'Bienvenido a CURSUS' })

describe('rutas protegidas', () => {
  test.each(['/', '/mis-cursos'])(
    'sin sesión, %s redirige a /login',
    async (path) => {
      simularBackend('ALUMNO')
      renderApp(path)
      expect(await pantallaLogin()).toBeInTheDocument()
      expect(
        screen.queryByRole('navigation', { name: 'Navegación principal' }),
      ).not.toBeInTheDocument()
    },
  )
})

describe('inicio de sesión', () => {
  test('con credenciales válidas entra a la ruta que se pidió', async () => {
    const fetch = simularBackend('PROFESOR')
    renderApp('/mis-cursos')
    await pantallaLogin()

    enviarLogin('profesor@norte.cursus.test', 'cursus_demo')

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Mis Cursos' }),
    ).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith(
      '/api/auth/login',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          correo: 'profesor@norte.cursus.test',
          password: 'cursus_demo',
        }),
      }),
    )
    // Con el token arma la sesión real.
    expect(fetch).toHaveBeenCalledWith('/api/auth/yo', {
      headers: { Authorization: 'Bearer jwt-de-prueba' },
    })
  })

  test('si /api/auth/yo rechaza el token, vuelve a /login', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 401 }))
    vi.stubGlobal('fetch', fetch)
    renderApp('/', 'jwt-vencido')

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Bienvenido a CURSUS',
      }),
    ).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith('/api/auth/yo', expect.anything())
  })

  test('con credenciales inválidas se queda en /login', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 401 }))
    vi.stubGlobal('fetch', fetch)
    renderApp('/')
    await pantallaLogin()

    enviarLogin('profesor@norte.cursus.test', 'otra')

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith('/api/auth/login', expect.anything()),
    )
    // El botón vuelve a habilitarse cuando termina el intento.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Ingresar' })).toBeEnabled(),
    )
    expect(await pantallaLogin()).toBeInTheDocument()
  })
})
