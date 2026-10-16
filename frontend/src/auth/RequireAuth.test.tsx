import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, test, vi } from 'vitest'
import App from '../App'
import { SessionProvider } from '../session/SessionProvider'
import { AuthProvider } from './AuthProvider'

function renderApp(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <SessionProvider initialRol="PROFESOR">
          <App />
        </SessionProvider>
      </AuthProvider>
    </MemoryRouter>,
  )
}

function enviarLogin(correo: string, password: string) {
  fireEvent.change(screen.getByLabelText('Correo institucional'), {
    target: { value: correo },
  })
  fireEvent.change(screen.getByLabelText('Contraseña'), {
    target: { value: password },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }))
}

const pantallaLogin = () =>
  screen.getByRole('heading', { level: 1, name: 'Bienvenido a CURSUS' })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('rutas protegidas', () => {
  test.each(['/', '/mis-cursos'])(
    'sin sesión, %s redirige a /login',
    (path) => {
      renderApp(path)
      expect(pantallaLogin()).toBeInTheDocument()
      expect(
        screen.queryByRole('navigation', { name: 'Navegación principal' }),
      ).not.toBeInTheDocument()
    },
  )
})

describe('inicio de sesión', () => {
  test('con credenciales válidas entra a la ruta que se pidió', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ accessToken: 'jwt-de-prueba' }), {
        status: 200,
      }),
    )
    vi.stubGlobal('fetch', fetch)
    renderApp('/mis-cursos')

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
  })

  test('con credenciales inválidas se queda en /login', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 401 }))
    vi.stubGlobal('fetch', fetch)
    renderApp('/')

    enviarLogin('profesor@norte.cursus.test', 'otra')

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    // El botón vuelve a habilitarse cuando termina el intento.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Ingresar' })).toBeEnabled(),
    )
    expect(pantallaLogin()).toBeInTheDocument()
  })
})
