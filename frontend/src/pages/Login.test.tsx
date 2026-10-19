import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { renderApp, usuarioDePrueba } from '../test/sesion'

const MENSAJE =
  'No pudimos iniciar sesión. Revisa tus credenciales e inténtalo nuevamente.'
const CORREO = 'profesor@norte.cursus.test'

function simularLogin(responder: () => Promise<Response>) {
  const fetch = vi.fn((ruta: string) =>
    ruta === '/api/auth/login'
      ? responder()
      : Promise.resolve(new Response(null, { status: 401 })),
  )
  vi.stubGlobal('fetch', fetch)
  return fetch
}

async function completarFormulario(correo = CORREO) {
  await screen.findByRole('heading', { name: 'Bienvenido a CURSUS' })
  fireEvent.change(screen.getByLabelText('Correo institucional'), {
    target: { value: correo },
  })
  fireEvent.change(screen.getByLabelText('Contraseña'), {
    target: { value: 'contraseña-incorrecta' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }))
}

describe('AUTH-02: credenciales inválidas', () => {
  test.each([CORREO, 'nadie@norte.cursus.test'])(
    'muestra el mismo mensaje, conserva %s y limpia la contraseña',
    async (correo) => {
      const fetch = simularLogin(() =>
        Promise.resolve(
          new Response(JSON.stringify({ message: 'Credenciales inválidas' }), {
            status: 401,
          }),
        ),
      )
      renderApp('/login')

      await completarFormulario(correo)

      expect(await screen.findByRole('alert')).toHaveTextContent(MENSAJE)
      expect(screen.getByLabelText('Correo institucional')).toHaveValue(correo)
      expect(screen.getByLabelText('Contraseña')).toHaveValue('')
      expect(screen.getByLabelText('Contraseña')).toHaveFocus()
      expect(
        screen.getByLabelText('Correo institucional'),
      ).toHaveAccessibleDescription(MENSAJE)
      expect(screen.getByLabelText('Contraseña')).toHaveAccessibleDescription(
        MENSAJE,
      )
      expect(screen.getByRole('button', { name: 'Ingresar' })).toBeEnabled()
      expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
      expect(fetch).toHaveBeenCalledWith('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correo, password: 'contraseña-incorrecta' }),
      })
      expect(fetch.mock.calls.some(([ruta]) => ruta === '/api/auth/yo')).toBe(
        false,
      )
    },
  )

  test('permite corregir la contraseña y vuelve a la ruta protegida solicitada', async () => {
    const fetch = simularLogin(() =>
      Promise.resolve(new Response(null, { status: 401 })),
    )
    renderApp('/mis-cursos')
    await completarFormulario()
    await screen.findByRole('alert')

    fetch.mockImplementation((ruta) =>
      Promise.resolve(
        new Response(
          JSON.stringify(
            ruta === '/api/auth/login'
              ? { accessToken: 'jwt-de-prueba' }
              : usuarioDePrueba('PROFESOR'),
          ),
        ),
      ),
    )
    fireEvent.change(screen.getByLabelText('Contraseña'), {
      target: { value: 'contraseña-correcta' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }))

    expect(
      await screen.findByRole('heading', { name: 'Mis Cursos', level: 1 }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ correo: CORREO, password: 'contraseña-correcta' }),
    })
  })

  test('retira el error anterior y deshabilita Ingresar durante el reintento', async () => {
    let responder!: (respuesta: Response) => void
    const fetch = simularLogin(() =>
      Promise.resolve(new Response(null, { status: 401 })),
    )
    renderApp('/login')
    await completarFormulario()
    await screen.findByRole('alert')

    fetch.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          responder = resolve
        }),
    )
    fireEvent.change(screen.getByLabelText('Contraseña'), {
      target: { value: 'otro-intento' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }))
    await waitFor(() => expect(responder).toBeDefined())

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ingresar' })).toBeDisabled()
    responder(new Response(null, { status: 401 }))

    expect(await screen.findByRole('alert')).toHaveTextContent(MENSAJE)
    expect(screen.getByLabelText('Correo institucional')).toHaveValue(CORREO)
    expect(screen.getByLabelText('Contraseña')).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Ingresar' })).toBeEnabled()
  })

  test('si no hay conexión también permite reintentar sin perder el correo', async () => {
    simularLogin(() => Promise.reject(new TypeError('offline')))
    renderApp('/login')
    await completarFormulario()

    expect(await screen.findByRole('alert')).toHaveTextContent(MENSAJE)
    expect(screen.getByLabelText('Correo institucional')).toHaveValue(CORREO)
    expect(screen.getByLabelText('Contraseña')).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Ingresar' })).toBeEnabled()
  })
})
