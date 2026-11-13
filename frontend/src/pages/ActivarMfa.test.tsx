import type { InicioMfa } from '@cursus/shared'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { json, renderConSesion, type RutaSimulada } from '../test/sesion'

afterEach(() => {
  vi.unstubAllGlobals()
})

const INICIO: InicioMfa = {
  secreto: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
  uri: 'otpauth://totp/CURSUS:alumno%40norte.cursus.test?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=CURSUS',
  qr: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 29 29"><path d="M0 0h7v7H0z"/></svg>',
}

const tarjeta = () =>
  screen.getByRole('region', { name: 'Verificación en dos pasos' })
const activar = () =>
  within(tarjeta()).getByRole('button', {
    name: 'Activar verificación en dos pasos',
  })
const campoCodigo = () =>
  within(tarjeta()).getByLabelText(/Ingresa el código de 6 dígitos/)
const confirmarBoton = () =>
  within(tarjeta()).getByRole('button', { name: 'Confirmar' })

// Simula el flujo completo: inicio responde INICIO y confirmación lo que diga
// `confirmacion`. Guarda los cuerpos enviados.
function rutas(
  confirmacion: RutaSimulada = () => new Response(null, { status: 204 }),
  extra: Record<string, RutaSimulada> = {},
) {
  const enviados: unknown[] = []
  return {
    enviados,
    rutas: {
      '/api/perfil/mfa/inicio': () => INICIO,
      '/api/perfil/mfa/confirmacion': (init?: RequestInit) => {
        enviados.push(JSON.parse(String(init?.body)))
        return confirmacion(init)
      },
      ...extra,
    },
  }
}

async function abrirQr() {
  await screen.findByRole('region', { name: 'Verificación en dos pasos' })
  fireEvent.click(
    await within(tarjeta()).findByRole('button', {
      name: 'Activar verificación en dos pasos',
    }),
  )
  return within(tarjeta()).findByRole('img', {
    name: 'Código QR para configurar tu app autenticadora',
  })
}

describe('verificación en dos pasos (SEG-01)', () => {
  test.each(['ALUMNO', 'PROFESOR', 'ADMINISTRATIVO', 'DIRECTOR'] as const)(
    '%s la ve en su perfil, inactiva, con el botón para activarla',
    async (rol) => {
      await renderConSesion(rol, '/perfil')

      expect(
        await within(tarjeta()).findByText(/Google Authenticator o Authy/),
      ).toBeInTheDocument()
      expect(activar()).toBeEnabled()
    },
  )

  test('criterio 1: genera desde el perfil un QR y la clave para ingresarla a mano', async () => {
    const pedidos: (string | undefined)[] = []
    await renderConSesion('ALUMNO', '/perfil', {
      '/api/perfil/mfa/inicio': (init) => {
        pedidos.push(init?.method)
        return INICIO
      },
    })

    const qr = await abrirQr()

    expect(pedidos).toEqual(['POST'])
    expect(qr).toHaveAttribute(
      'src',
      `data:image/svg+xml;charset=utf-8,${encodeURIComponent(INICIO.qr)}`,
    )
    // La clave se muestra en grupos de cuatro, como en las apps.
    expect(
      within(tarjeta()).getByText('JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP'),
    ).toBeInTheDocument()
    expect(campoCodigo()).toHaveAttribute('autocomplete', 'one-time-code')
    expect(campoCodigo()).toHaveAttribute('inputmode', 'numeric')
    expect(confirmarBoton()).toBeDisabled()
  })

  test('criterio 2: con un código válido la activa y lo avisa', async () => {
    const { enviados, rutas: simuladas } = rutas()
    await renderConSesion('PROFESOR', '/perfil', simuladas)
    await abrirQr()

    // Las apps muestran el código con un espacio al medio.
    fireEvent.change(campoCodigo(), { target: { value: '123 456' } })
    fireEvent.click(confirmarBoton())

    // El indicador de carga también es role="status": se espera el texto.
    expect(
      await within(tarjeta()).findByText('Verificación en dos pasos activada.'),
    ).toHaveAttribute('role', 'status')
    expect(enviados).toEqual([{ codigo: '123456' }])
    expect(within(tarjeta()).queryByRole('img')).not.toBeInTheDocument()
    expect(
      within(tarjeta()).queryByRole('button', {
        name: 'Activar verificación en dos pasos',
      }),
    ).not.toBeInTheDocument()
  })

  test('criterio 2: un código incorrecto no la activa, avisa y deja reintentar', async () => {
    const { rutas: simuladas } = rutas(() =>
      json({ message: 'El código no es válido' }, 400),
    )
    await renderConSesion('ALUMNO', '/perfil', simuladas)
    await abrirQr()

    fireEvent.change(campoCodigo(), { target: { value: '000000' } })
    fireEvent.click(confirmarBoton())

    expect(await within(tarjeta()).findByRole('alert')).toHaveTextContent(
      'El código no es válido. Revisa que la hora de tu teléfono esté bien',
    )
    // Sigue el QR para intentar con el código siguiente.
    expect(within(tarjeta()).getByRole('img')).toBeInTheDocument()
    expect(campoCodigo()).toHaveValue('')
  })

  test.each(['12345', '12a456', '1234567'])(
    'no envía el código %j: no son 6 dígitos',
    async (codigo) => {
      const { enviados, rutas: simuladas } = rutas()
      await renderConSesion('ALUMNO', '/perfil', simuladas)
      await abrirQr()

      fireEvent.change(campoCodigo(), { target: { value: codigo } })
      fireEvent.click(confirmarBoton())

      expect(await within(tarjeta()).findByRole('alert')).toHaveTextContent(
        'Ingresa los 6 dígitos que muestra tu app autenticadora.',
      )
      expect(enviados).toEqual([])
    },
  )

  test('si ya está activa, lo dice y no ofrece activarla de nuevo', async () => {
    await renderConSesion('DIRECTOR', '/perfil', {
      '/api/perfil/mfa': () => ({ activo: true }),
    })

    // El indicador de carga también es role="status": se espera el texto.
    expect(
      await within(tarjeta()).findByText(
        'La verificación en dos pasos está activa en tu cuenta.',
      ),
    ).toHaveAttribute('role', 'status')
    expect(
      within(tarjeta()).queryByRole('button', {
        name: 'Activar verificación en dos pasos',
      }),
    ).not.toBeInTheDocument()
  })

  test('cancelar oculta el QR y vuelve al botón de activar', async () => {
    const { rutas: simuladas } = rutas()
    await renderConSesion('ALUMNO', '/perfil', simuladas)
    await abrirQr()

    fireEvent.click(within(tarjeta()).getByRole('button', { name: 'Cancelar' }))

    expect(within(tarjeta()).queryByRole('img')).not.toBeInTheDocument()
    expect(activar()).toBeEnabled()
  })

  test('si se activó en otra pestaña (409), muestra que está activa', async () => {
    await renderConSesion('ALUMNO', '/perfil', {
      '/api/perfil/mfa/inicio': () =>
        json({ message: 'La verificación en dos pasos ya está activa' }, 409),
    })
    fireEvent.click(
      await within(
        await screen.findByRole('region', {
          name: 'Verificación en dos pasos',
        }),
      ).findByRole('button', { name: 'Activar verificación en dos pasos' }),
    )

    // El indicador de carga también es role="status": se espera el texto.
    expect(
      await within(tarjeta()).findByText(
        'La verificación en dos pasos está activa en tu cuenta.',
      ),
    ).toHaveAttribute('role', 'status')
  })

  test('si el QR pendiente ya no existe, pide generar uno nuevo', async () => {
    const { rutas: simuladas } = rutas(() =>
      json({ message: 'Primero genera el código QR' }, 400),
    )
    await renderConSesion('ALUMNO', '/perfil', simuladas)
    await abrirQr()

    fireEvent.change(campoCodigo(), { target: { value: '123456' } })
    fireEvent.click(confirmarBoton())

    expect(await within(tarjeta()).findByRole('alert')).toHaveTextContent(
      'El código QR expiró. Genera uno nuevo e intenta de nuevo.',
    )
    expect(activar()).toBeEnabled()
  })

  test('si el MFA no está disponible (503), lo avisa', async () => {
    await renderConSesion('ALUMNO', '/perfil', {
      '/api/perfil/mfa/inicio': () => json({}, 503),
    })
    fireEvent.click(
      await within(
        await screen.findByRole('region', {
          name: 'Verificación en dos pasos',
        }),
      ).findByRole('button', { name: 'Activar verificación en dos pasos' }),
    )

    expect(await within(tarjeta()).findByRole('alert')).toHaveTextContent(
      'La verificación en dos pasos no está disponible por ahora.',
    )
  })

  test('si falla al generar el QR, avisa y deja intentar de nuevo', async () => {
    await renderConSesion('ALUMNO', '/perfil', {
      '/api/perfil/mfa/inicio': () => json({}, 500),
    })
    fireEvent.click(
      await within(
        await screen.findByRole('region', {
          name: 'Verificación en dos pasos',
        }),
      ).findByRole('button', { name: 'Activar verificación en dos pasos' }),
    )

    expect(await within(tarjeta()).findByRole('alert')).toHaveTextContent(
      'No se pudo generar el código QR. Intenta de nuevo.',
    )
    await waitFor(() => expect(activar()).toBeEnabled())
  })

  test('si falla la confirmación, avisa y conserva el QR', async () => {
    const { rutas: simuladas } = rutas(() => json({}, 500))
    await renderConSesion('ALUMNO', '/perfil', simuladas)
    await abrirQr()

    fireEvent.change(campoCodigo(), { target: { value: '123456' } })
    fireEvent.click(confirmarBoton())

    expect(await within(tarjeta()).findByRole('alert')).toHaveTextContent(
      'No se pudo activar la verificación. Intenta de nuevo.',
    )
    expect(within(tarjeta()).getByRole('img')).toBeInTheDocument()
    await waitFor(() => expect(confirmarBoton()).toBeEnabled())
  })

  test('si no carga el estado, muestra el error con reintento', async () => {
    let intentos = 0
    await renderConSesion('ALUMNO', '/perfil', {
      '/api/perfil/mfa': () =>
        ++intentos === 1 ? json({}, 500) : { activo: false },
    })

    const error = await within(tarjeta()).findByRole('alert')
    expect(error).toHaveTextContent(
      'No pudimos cargar el estado de la verificación en dos pasos.',
    )
    fireEvent.click(within(error).getByRole('button', { name: 'Reintentar' }))

    expect(
      await within(tarjeta()).findByRole('button', {
        name: 'Activar verificación en dos pasos',
      }),
    ).toBeEnabled()
  })
})
