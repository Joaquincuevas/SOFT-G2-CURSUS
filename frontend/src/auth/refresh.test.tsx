import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { renderApp, usuarioDePrueba } from '../test/sesion'
import { AVISO_SESION_EXPIRADA, renovarToken } from './auth'

const json = (cuerpo: unknown) =>
  new Response(JSON.stringify(cuerpo), { status: 200 })
const status = (codigo: number) => new Response(null, { status: codigo })

// Backend simulado: `refresh` responde POST /api/auth/refresh y /api/auth/yo
// solo acepta el JWT `valido`.
function simular({
  refresh,
  valido,
}: {
  refresh: () => Response
  valido: string
}) {
  const fetch = vi.fn((url: string, init?: RequestInit) => {
    if (url === '/api/auth/refresh') return Promise.resolve(refresh())
    if (url === '/api/auth/logout') return Promise.resolve(status(204))
    const auth = (init?.headers as Record<string, string> | undefined)
      ?.Authorization
    return Promise.resolve(
      auth === `Bearer ${valido}`
        ? json(usuarioDePrueba('PROFESOR'))
        : status(401),
    )
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}

const llamadasA = (fetch: ReturnType<typeof simular>, url: string) =>
  fetch.mock.calls.filter(([ruta]) => ruta === url)

const pantallaLogin = () =>
  screen.findByRole('heading', { level: 1, name: 'Bienvenido a CURSUS' })

describe('restaurar la sesión al recargar', () => {
  test('con una cookie válida, sigue en la ruta pedida', async () => {
    const fetch = simular({
      refresh: () => json({ accessToken: 'jwt-restaurado' }),
      valido: 'jwt-restaurado',
    })
    renderApp('/mis-cursos')

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Mis Cursos' }),
    ).toBeInTheDocument()
    expect(llamadasA(fetch, '/api/auth/refresh')).toHaveLength(1)
  })

  test('sin cookie va al login, sin aviso', async () => {
    simular({ refresh: () => status(401), valido: 'x' })
    renderApp('/mis-cursos')

    expect(await pantallaLogin()).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('JWT expirado', () => {
  test('un 401 renueva el JWT y reintenta sin salir de la página', async () => {
    const fetch = simular({
      refresh: () => json({ accessToken: 'jwt-nuevo' }),
      valido: 'jwt-nuevo',
    })
    renderApp('/mis-cursos', 'jwt-vencido')

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Mis Cursos' }),
    ).toBeInTheDocument()
    expect(llamadasA(fetch, '/api/auth/refresh')).toHaveLength(1)
    expect(llamadasA(fetch, '/api/auth/yo').at(-1)?.[1]).toEqual({
      headers: { Authorization: 'Bearer jwt-nuevo' },
    })
  })

  test('si la renovación falla, vuelve al login con el aviso', async () => {
    const fetch = simular({ refresh: () => status(401), valido: 'x' })
    renderApp('/mis-cursos', 'jwt-vencido')

    expect(await pantallaLogin()).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(AVISO_SESION_EXPIRADA)
    expect(llamadasA(fetch, '/api/auth/logout')).toHaveLength(1)
  })

  test('el aviso desaparece al volver a iniciar sesión', async () => {
    simular({ refresh: () => status(401), valido: 'x' })
    renderApp('/', 'jwt-vencido')
    await pantallaLogin()
    expect(screen.getByRole('alert')).toBeInTheDocument()

    // Ahora el login es válido.
    vi.mocked(fetch).mockImplementation((url) =>
      Promise.resolve(
        url === '/api/auth/login'
          ? json({ accessToken: 'jwt-de-prueba' })
          : json(usuarioDePrueba('PROFESOR')),
      ),
    )
    fireEvent.change(screen.getByLabelText('Correo institucional'), {
      target: { value: 'profesor@norte.cursus.test' },
    })
    fireEvent.change(screen.getByLabelText('Contraseña'), {
      target: { value: 'cursus_demo' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }))

    await screen.findByRole('navigation', { name: 'Navegación principal' })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('renovarToken', () => {
  test('pedidos simultáneos comparten una sola renovación', async () => {
    let responder: (respuesta: Response) => void = () => {}
    const fetch = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          responder = resolve
        }),
    )
    vi.stubGlobal('fetch', fetch)

    const renovaciones = [renovarToken(), renovarToken(), renovarToken()]
    responder(json({ accessToken: 'jwt-nuevo' }))

    expect(await Promise.all(renovaciones)).toEqual([
      'jwt-nuevo',
      'jwt-nuevo',
      'jwt-nuevo',
    ])
    expect(fetch).toHaveBeenCalledOnce()

    // Terminada la renovación, la siguiente vuelve a pedir.
    fetch.mockResolvedValue(json({ accessToken: 'otro' }))
    expect(await renovarToken()).toBe('otro')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  test('usa Web Locks para turnarse con otras pestañas', async () => {
    const request = vi.fn((_nombre: string, tarea: () => Promise<unknown>) =>
      tarea(),
    )
    vi.stubGlobal('navigator', { ...navigator, locks: { request } })
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(json({ accessToken: 'jwt' }))),
    )

    expect(await renovarToken()).toBe('jwt')
    expect(request).toHaveBeenCalledWith('cursus-refresh', expect.any(Function))
  })
})

test('Cerrar Sesión revoca el refresh token en el backend', async () => {
  const fetch = simular({ refresh: () => status(401), valido: 'jwt' })
  renderApp('/', 'jwt')
  fireEvent.click(await screen.findByRole('button', { name: 'Cerrar Sesión' }))

  await pantallaLogin()
  await waitFor(() =>
    expect(fetch).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' }),
  )
  // Un logout pedido por el usuario no muestra el aviso de expiración.
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
