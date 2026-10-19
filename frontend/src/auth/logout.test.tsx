import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation, useNavigate } from 'react-router'
import { describe, expect, test, vi } from 'vitest'
import { AuthProvider } from './AuthProvider'
import { SESION_CERRADA, useAuth } from './auth'
import { renderApp, simularBackend } from '../test/sesion'

const json = (body: unknown) => new Response(JSON.stringify(body))
const login = () =>
  screen.findByRole('heading', { name: 'Bienvenido a CURSUS' })

function Controles() {
  const auth = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  return (
    <>
      <p>{auth.token ?? 'sin sesión'}</p>
      <p>{location.pathname}</p>
      <button onClick={() => void auth.cerrarSesion()}>Salir</button>
      <button onClick={() => void auth.fetchConSesion('/protegida')}>
        Pedir
      </button>
      <button onClick={() => navigate(-1)}>Atrás</button>
    </>
  )
}

function controles() {
  return render(
    <MemoryRouter initialEntries={['/mis-cursos']}>
      <AuthProvider initialToken="jwt">
        <Controles />
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('cierre de sesión', () => {
  test('retira el acceso y redirige sin esperar una respuesta del servidor', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {})),
    )
    controles()
    fireEvent.click(screen.getByText('Salir'))
    expect(screen.getByText('sin sesión')).toBeInTheDocument()
    expect(screen.getByText('/login')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Atrás'))
    expect(screen.getByText('/login')).toBeInTheDocument()
    expect(localStorage.getItem(SESION_CERRADA)).toBe('1')
  })

  test.each(['/', '/mis-cursos'])(
    'tras cerrar, %s no carga ni restaura la cookie',
    async (ruta) => {
      const fetch = simularBackend('PROFESOR')
      const vista = controles()
      fireEvent.click(screen.getByText('Salir'))
      await waitFor(() =>
        expect(fetch).toHaveBeenCalledWith('/api/auth/logout', {
          method: 'POST',
        }),
      )
      vista.unmount()
      fetch.mockClear()
      renderApp(ruta)
      expect(await login()).toBeInTheDocument()
      expect(fetch).not.toHaveBeenCalled()
    },
  )

  test('sin conexión, recargar tampoco restaura la sesión', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    const vista = controles()
    fireEvent.click(screen.getByText('Salir'))
    await act(async () => {})
    vista.unmount()
    renderApp('/mis-cursos')
    expect(await login()).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  test('una renovación pendiente no recupera el token ni reintenta la ruta', async () => {
    let responder!: (response: Response) => void
    const fetch = vi.fn((url: string) => {
      if (url === '/api/auth/refresh')
        return new Promise<Response>((resolve) => {
          responder = resolve
        })
      return Promise.resolve(
        new Response(null, { status: url === '/api/auth/logout' ? 204 : 401 }),
      )
    })
    vi.stubGlobal('fetch', fetch)
    controles()
    fireEvent.click(screen.getByText('Pedir'))
    await waitFor(() => expect(responder).toBeDefined())
    fireEvent.click(screen.getByText('Salir'))
    await act(async () => responder(json({ accessToken: 'jwt-tardío' })))
    expect(screen.getByText('sin sesión')).toBeInTheDocument()
    expect(screen.getByText('/login')).toBeInTheDocument()
    expect(
      fetch.mock.calls.filter(([url]) => url === '/protegida'),
    ).toHaveLength(1)
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      '/protegida',
      '/api/auth/refresh',
      '/api/auth/logout',
    ])
  })

  test('recibe el cierre de otra pestaña y deja de enviar pedidos protegidos', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    controles()
    act(() =>
      window.dispatchEvent(
        new StorageEvent('storage', { key: SESION_CERRADA, newValue: '1' }),
      ),
    )
    fireEvent.click(screen.getByText('Pedir'))
    expect(screen.getByText('sin sesión')).toBeInTheDocument()
    expect(screen.getByText('/login')).toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
  })
})
