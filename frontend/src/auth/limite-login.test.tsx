import { fireEvent, screen, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { renderApp, usuarioDePrueba } from '../test/sesion'

async function enviar() {
  fireEvent.change(screen.getByLabelText('Correo institucional'), {
    target: { value: 'profesor@norte.cursus.test' },
  })
  fireEvent.change(screen.getByLabelText('Contraseña'), {
    target: { value: 'incorrecta' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }))
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Ingresar' })).toBeEnabled(),
  )
}

test.each([
  ['900', '15 minutos'],
  ['61', '2 minutos'],
  ['30', '1 minuto'],
  [null, '15 minutos'],
  ['inválido', '15 minutos'],
])(
  'muestra la espera al recibir 429 con Retry-After %s',
  async (retryAfter, tiempo) => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        Promise.resolve(
          new Response(null, {
            status: url === '/api/auth/login' ? 429 : 401,
            headers: retryAfter === null ? {} : { 'Retry-After': retryAfter },
          }),
        ),
      ),
    )
    renderApp('/login')
    await screen.findByRole('heading', { name: 'Bienvenido a CURSUS' })
    await enviar()
    expect(screen.getByRole('alert')).toHaveTextContent(
      `Espera ${tiempo} antes de volver a intentar`,
    )
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  },
)

test('un login exitoso posterior elimina el aviso y permite entrar', async () => {
  const fetch = vi.fn((url: string) =>
    Promise.resolve(
      new Response(null, { status: url === '/api/auth/login' ? 429 : 401 }),
    ),
  )
  vi.stubGlobal('fetch', fetch)
  renderApp('/login')
  await screen.findByRole('heading', { name: 'Bienvenido a CURSUS' })
  await enviar()
  expect(screen.getByRole('alert')).toBeInTheDocument()
  fetch.mockImplementation((url) =>
    Promise.resolve(
      new Response(
        JSON.stringify(
          url === '/api/auth/login'
            ? { accessToken: 'jwt' }
            : usuarioDePrueba('PROFESOR'),
        ),
      ),
    ),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }))
  expect(
    await screen.findByRole('navigation', { name: 'Navegación principal' }),
  ).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('un fallo de red libera el formulario sin promesas rechazadas', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
  renderApp('/login')
  await screen.findByRole('heading', { name: 'Bienvenido a CURSUS' })
  await enviar()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
