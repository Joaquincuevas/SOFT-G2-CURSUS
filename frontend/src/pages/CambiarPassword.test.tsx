import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { json, renderConSesion } from '../test/sesion'

afterEach(() => {
  vi.unstubAllGlobals()
})

const campo = (nombre: string) =>
  screen.getByLabelText(nombre) as HTMLInputElement
const enviar = () => screen.getByRole('button', { name: 'Cambiar contraseña' })

function completar(actual: string, nueva: string, repetida = nueva) {
  fireEvent.change(campo('Contraseña actual'), { target: { value: actual } })
  fireEvent.change(campo('Contraseña nueva'), { target: { value: nueva } })
  fireEvent.change(campo('Repetir contraseña nueva'), {
    target: { value: repetida },
  })
}

describe('cambiar contraseña (PER-02)', () => {
  test.each(['ALUMNO', 'DIRECTOR'] as const)(
    '%s ve los tres campos de contraseña ocultos',
    async (rol) => {
      await renderConSesion(rol, '/perfil')

      expect(
        screen.getByRole('heading', { name: 'Cambiar contraseña' }),
      ).toBeInTheDocument()
      expect(campo('Contraseña actual')).toHaveAttribute(
        'autocomplete',
        'current-password',
      )
      for (const nombre of ['Contraseña nueva', 'Repetir contraseña nueva']) {
        expect(campo(nombre)).toHaveAttribute('type', 'password')
        expect(campo(nombre)).toHaveAttribute('autocomplete', 'new-password')
      }
      expect(enviar()).toBeDisabled()
    },
  )

  test('envía la contraseña actual y la nueva, y vacía los campos', async () => {
    const pedidos: unknown[] = []
    await renderConSesion('PROFESOR', '/perfil', {
      '/api/auth/password': (init) => {
        pedidos.push({
          method: init?.method,
          ...JSON.parse(String(init?.body)),
        })
        return new Response(null, { status: 204 })
      },
    })

    completar('contraseña-vieja', 'contraseña-nueva')
    fireEvent.click(enviar())

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Contraseña actualizada.',
    )
    expect(pedidos).toEqual([
      {
        method: 'PUT',
        passwordActual: 'contraseña-vieja',
        passwordNueva: 'contraseña-nueva',
      },
    ])
    expect(campo('Contraseña actual').value).toBe('')
    expect(campo('Contraseña nueva').value).toBe('')
    expect(campo('Repetir contraseña nueva').value).toBe('')
  })

  test.each([
    [
      'las nuevas no coinciden',
      ['actual-123', 'nueva-1234', 'nueva-5678'],
      'Las contraseñas nuevas no coinciden.',
    ],
    [
      'la nueva es corta',
      ['actual-123', 'corta', 'corta'],
      'La contraseña nueva debe tener al menos 8 caracteres.',
    ],
    [
      'la nueva es igual a la actual',
      ['misma-clave', 'misma-clave', 'misma-clave'],
      'La contraseña nueva debe ser distinta de la actual.',
    ],
  ])(
    'no envía nada si %s',
    async (_caso, [actual, nueva, repetida], mensaje) => {
      const fetch = await renderConSesion('ALUMNO', '/perfil').then(
        () => globalThis.fetch as ReturnType<typeof vi.fn>,
      )

      completar(actual, nueva, repetida)
      fireEvent.click(enviar())

      expect(await screen.findByRole('alert')).toHaveTextContent(mensaje)
      expect(
        fetch.mock.calls.some(([url]) => url === '/api/auth/password'),
      ).toBe(false)
    },
  )

  test('muestra el error del backend si la actual no es correcta', async () => {
    await renderConSesion('ALUMNO', '/perfil', {
      '/api/auth/password': () =>
        json({ message: 'La contraseña actual no es correcta' }, 400),
    })

    completar('equivocada', 'contraseña-nueva')
    fireEvent.click(enviar())

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'La contraseña actual no es correcta.',
    )
    expect(campo('Contraseña nueva').value).toBe('contraseña-nueva')
  })

  test('avisa cuánto esperar después de demasiados intentos', async () => {
    await renderConSesion('ALUMNO', '/perfil', {
      '/api/auth/password': () =>
        new Response('{}', { status: 429, headers: { 'Retry-After': '600' } }),
    })

    completar('equivocada', 'contraseña-nueva')
    fireEvent.click(enviar())

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Demasiados intentos fallidos. Intenta de nuevo en 10 minutos.',
    )
  })

  test('si el servidor falla, avisa y deja intentar de nuevo', async () => {
    await renderConSesion('ALUMNO', '/perfil', {
      '/api/auth/password': () => json({}, 500),
    })

    completar('contraseña-vieja', 'contraseña-nueva')
    fireEvent.click(enviar())

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo cambiar la contraseña. Intenta de nuevo.',
    )
    await waitFor(() => expect(enviar()).toBeEnabled())
  })
})
