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

describe('SEG-03: recuperación de contraseña', () => {
  test('rechaza un fragmento inválido antes de mostrar el formulario', async () => {
    simularLogin(() => Promise.resolve(new Response(null, { status: 401 })))
    renderApp('/restablecer-password#invalido')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El enlace es inválido',
    )
    expect(
      screen.queryByRole('button', { name: 'Guardar contraseña' }),
    ).toBeNull()
  })

  test.each([204, 400])(
    'restablece con confirmación y maneja HTTP %i',
    async (status) => {
      const token = 'a'.repeat(64)
      const api = vi.fn((ruta: string) =>
        Promise.resolve(
          new Response(null, {
            status: ruta === '/api/auth/restablecer-password' ? status : 401,
          }),
        ),
      )
      vi.stubGlobal('fetch', api)
      const reemplazar = vi.spyOn(window.history, 'replaceState')
      try {
        renderApp(`/restablecer-password#${token}`)
        const passwordNueva = 'contraseña nueva'
        fireEvent.change(await screen.findByLabelText('Nueva contraseña'), {
          target: { value: passwordNueva },
        })
        const confirmacion = screen.getByLabelText('Confirma la contraseña')
        const guardar = screen.getByRole('button', {
          name: 'Guardar contraseña',
        })
        fireEvent.change(confirmacion, { target: { value: 'otra contraseña' } })
        fireEvent.click(guardar)
        expect(screen.getByRole('alert')).toHaveTextContent(
          'Las contraseñas deben coincidir',
        )
        expect(
          api.mock.calls.some(
            ([ruta]) => ruta === '/api/auth/restablecer-password',
          ),
        ).toBe(false)
        fireEvent.change(confirmacion, { target: { value: passwordNueva } })
        fireEvent.click(guardar)
        if (status === 204) {
          expect(
            await screen.findByText(/Contraseña actualizada/),
          ).toBeVisible()
          expect(reemplazar).toHaveBeenCalledWith(
            window.history.state,
            '',
            '/restablecer-password',
          )
        } else {
          expect(
            await screen.findByText(/El enlace es inválido o expiró/),
          ).toBeVisible()
        }
        expect(api).toHaveBeenCalledWith(
          '/api/auth/restablecer-password',
          expect.objectContaining({
            body: JSON.stringify({ token, passwordNueva }),
          }),
        )
      } finally {
        reemplazar.mockRestore()
      }
    },
  )

  test('abre la recuperación desde el login y muestra el mensaje genérico', async () => {
    const api = vi.fn((ruta: string) =>
      Promise.resolve(
        new Response(null, {
          status: ruta === '/api/auth/recuperar-password' ? 204 : 401,
        }),
      ),
    )
    vi.stubGlobal('fetch', api)
    renderApp('/login')
    fireEvent.click(
      await screen.findByRole('link', { name: '¿Olvidaste tu contraseña?' }),
    )
    fireEvent.change(screen.getByLabelText('Correo institucional'), {
      target: { value: CORREO },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar enlace' }))
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Si existe una cuenta',
    )
    expect(api).toHaveBeenCalledWith(
      '/api/auth/recuperar-password',
      expect.objectContaining({ body: JSON.stringify({ correo: CORREO }) }),
    )
  })
})

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
