import { fireEvent, screen, waitFor } from '@testing-library/react'
import { expect, test } from 'vitest'
import { renderApp, simularBackend, usuarioDePrueba } from '../test/sesion'

const principal = () =>
  document.documentElement.style.getPropertyValue('--color-primary')

test.each(['ADMINISTRATIVO', 'PROFESOR', 'AYUDANTE', 'ALUMNO'] as const)(
  '%s recibe el tema de su universidad al restaurar la sesión',
  async (rol) => {
    simularBackend(rol, {
      '/api/auth/yo': () => ({
        ...usuarioDePrueba(rol),
        universidadColor: '#0a5c36',
      }),
    })
    renderApp('/', 'token')
    await screen.findByRole('navigation')
    expect(principal()).toBe('#0a5c36')
  },
)

test('el Director conserva CURSUS aunque su universidad tenga otro color', async () => {
  simularBackend('DIRECTOR', {
    '/api/auth/yo': () => ({
      ...usuarioDePrueba('DIRECTOR'),
      universidadColor: '#0a5c36',
    }),
  })
  renderApp('/', 'token')
  await screen.findByRole('navigation')
  expect(principal()).toBe('')
})

test('al cerrar sesión vuelve a CURSUS y otro login toma su propio tema', async () => {
  let usuario = { ...usuarioDePrueba('PROFESOR'), universidadColor: '#0a5c36' }
  simularBackend('PROFESOR', { '/api/auth/yo': () => usuario })
  renderApp('/', 'token')
  await screen.findByRole('navigation')
  expect(principal()).toBe('#0a5c36')
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar Sesión' }))
  await screen.findByRole('button', { name: 'Ingresar' })
  expect(principal()).toBe('')
  usuario = { ...usuarioDePrueba('PROFESOR'), universidadColor: '#6b2d84' }
  fireEvent.change(screen.getByLabelText('Correo institucional'), {
    target: { value: usuario.correo },
  })
  fireEvent.change(screen.getByLabelText('Contraseña'), {
    target: { value: 'contraseña-de-prueba' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }))
  await screen.findByRole('navigation')
  await waitFor(() => expect(principal()).toBe('#6b2d84'))
})

test('una sesión antigua sin color o con color inválido conserva CURSUS', async () => {
  simularBackend('ALUMNO', {
    '/api/auth/yo': () => ({
      ...usuarioDePrueba('ALUMNO'),
      universidadColor: '#ffff00',
    }),
  })
  renderApp('/', 'token')
  await screen.findByRole('navigation')
  expect(principal()).toBe('')
})
