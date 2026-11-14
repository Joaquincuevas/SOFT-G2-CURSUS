import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { renderApp, usuarioDePrueba } from '../test/sesion'

// SEG-02: el login con MFA activo pide el código de la app en un segundo paso.
const CORREO = 'profesor@norte.cursus.test'
const PASSWORD = 'contraseña-correcta'
const DESAFIO = 'desafio.firmado.de-prueba'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

type Responder = (cuerpo: {
  desafio: string
  codigo: string
}) => Response | Promise<Response>

// Paso 1 responde con el desafío; el paso 2 lo decide cada test.
function simular(paso2: Responder) {
  const fetch = vi.fn((ruta: string, init?: RequestInit) => {
    if (ruta === '/api/auth/login') {
      return Promise.resolve(
        new Response(JSON.stringify({ mfaRequerido: true, desafio: DESAFIO })),
      )
    }
    if (ruta === '/api/auth/login/mfa') {
      return Promise.resolve(paso2(JSON.parse(String(init?.body)) as never))
    }
    if (ruta === '/api/auth/yo') {
      return Promise.resolve(
        new Response(JSON.stringify(usuarioDePrueba('PROFESOR'))),
      )
    }
    return Promise.resolve(
      new Response(JSON.stringify([]), {
        status: ruta === '/api/auth/refresh' ? 401 : 200,
      }),
    )
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}

const sesionOk = () =>
  new Response(JSON.stringify({ accessToken: 'jwt-de-prueba' }))
const rechazo = (
  status: number,
  cuerpo: object = {},
  headers: HeadersInit = {},
) => new Response(JSON.stringify(cuerpo), { status, headers })

async function paso1() {
  await screen.findByRole('heading', { name: 'Bienvenido a CURSUS' })
  fireEvent.change(screen.getByLabelText('Correo institucional'), {
    target: { value: CORREO },
  })
  fireEvent.change(screen.getByLabelText('Contraseña'), {
    target: { value: PASSWORD },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }))
  return screen.findByRole('heading', { name: 'Verificación en dos pasos' })
}

const campo = () => screen.getByLabelText('Código de verificación')
const verificar = (codigo: string) => {
  fireEvent.change(campo(), { target: { value: codigo } })
  fireEvent.click(screen.getByRole('button', { name: 'Verificar' }))
}
const llamadasMfa = (fetch: ReturnType<typeof vi.fn>) =>
  fetch.mock.calls.filter(([ruta]) => ruta === '/api/auth/login/mfa')

describe('login con MFA (SEG-02)', () => {
  test('tras la contraseña pide el código, con foco y teclado numérico', async () => {
    simular(() => sesionOk())
    renderApp('/login')
    await paso1()
    expect(campo()).toHaveFocus()
    expect(campo()).toHaveAttribute('inputmode', 'numeric')
    expect(campo()).toHaveAttribute('autocomplete', 'one-time-code')
    expect(screen.queryByLabelText('Contraseña')).toBeNull()
    // Sin sesión todavía: no hay menú.
    expect(screen.queryByRole('navigation')).toBeNull()
  })

  test('un código válido (con espacios) inicia sesión y envía el desafío', async () => {
    const fetch = simular(() => sesionOk())
    renderApp('/mis-cursos')
    await paso1()
    verificar('123 456')
    expect(
      await screen.findByRole('heading', { name: 'Mis Cursos', level: 1 }),
    ).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith('/api/auth/login/mfa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ desafio: DESAFIO, codigo: '123456' }),
    })
  })

  test('la contraseña no vuelve a enviarse en el segundo paso', async () => {
    const fetch = simular(() => sesionOk())
    renderApp('/login')
    await paso1()
    verificar('123456')
    await waitFor(() => expect(llamadasMfa(fetch)).toHaveLength(1))
    expect(
      JSON.stringify(
        fetch.mock.calls.filter(([r]) => r === '/api/auth/login/mfa'),
      ),
    ).not.toContain(PASSWORD)
  })

  test.each(['12345', '1234567', 'abcdef', ''])(
    'un código mal formado (%j) avisa sin enviar nada',
    async (codigo) => {
      const fetch = simular(() => sesionOk())
      renderApp('/login')
      await paso1()
      verificar(codigo)
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Ingresa los 6 dígitos',
      )
      expect(llamadasMfa(fetch)).toHaveLength(0)
    },
  )

  test('un código inválido avisa, limpia el campo y permite reintentar', async () => {
    let intentos = 0
    simular(() =>
      ++intentos === 1
        ? rechazo(401, { code: 'MFA_CODIGO_INVALIDO' })
        : sesionOk(),
    )
    renderApp('/mis-cursos')
    await paso1()
    verificar('000000')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El código no es válido o ya expiró',
    )
    expect(campo()).toHaveValue('')
    expect(campo()).toHaveFocus()
    expect(campo()).toHaveAccessibleDescription(/El código no es válido/)
    expect(screen.getByRole('button', { name: 'Verificar' })).toBeEnabled()
    verificar('654321')
    expect(
      await screen.findByRole('heading', { name: 'Mis Cursos', level: 1 }),
    ).toBeInTheDocument()
  })

  test('muestra la carga y deshabilita el botón mientras verifica', async () => {
    let responder!: (r: Response) => void
    simular(
      () =>
        new Promise<Response>((resolve) => {
          responder = resolve
        }),
    )
    renderApp('/login')
    await paso1()
    verificar('123456')
    const boton = await screen.findByRole('button', { name: 'Verificando…' })
    expect(boton).toBeDisabled()
    responder(rechazo(401, { code: 'MFA_CODIGO_INVALIDO' }))
    expect(
      await screen.findByRole('button', { name: 'Verificar' }),
    ).toBeEnabled()
  })

  test('si el desafío expiró, vuelve al paso 1 con un mensaje claro y conserva el correo', async () => {
    simular(() => rechazo(401, { code: 'MFA_DESAFIO_INVALIDO' }))
    renderApp('/login')
    await paso1()
    verificar('123456')
    expect(
      await screen.findByRole('heading', { name: 'Bienvenido a CURSUS' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'La verificación expiró. Vuelve a ingresar tu correo y contraseña.',
    )
    expect(screen.getByLabelText('Correo institucional')).toHaveValue(CORREO)
    expect(screen.getByLabelText('Contraseña')).toHaveValue('')
  })

  test('el rate limit bloquea el formulario y dice cuánto esperar', async () => {
    const fetch = simular(() =>
      rechazo(429, { statusCode: 429 }, { 'Retry-After': '600' }),
    )
    renderApp('/login')
    await paso1()
    verificar('123456')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Espera 10 minutos antes de volver a intentar',
    )
    expect(campo()).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Verificar' })).toBeDisabled()
    expect(llamadasMfa(fetch)).toHaveLength(1)
    // La salida sigue disponible.
    expect(
      screen.getByRole('button', { name: 'Volver al inicio de sesión' }),
    ).toBeEnabled()
  })

  test('un error del servidor se avisa y permite reintentar', async () => {
    simular(() => rechazo(500))
    renderApp('/login')
    await paso1()
    verificar('123456')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos verificar el código',
    )
    expect(screen.getByRole('button', { name: 'Verificar' })).toBeEnabled()
  })

  test('se puede volver al inicio de sesión', async () => {
    simular(() => sesionOk())
    renderApp('/login')
    await paso1()
    fireEvent.click(
      screen.getByRole('button', { name: 'Volver al inicio de sesión' }),
    )
    expect(
      await screen.findByRole('heading', { name: 'Bienvenido a CURSUS' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Correo institucional')).toHaveValue(CORREO)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  test('sin MFA el login sigue en un solo paso', async () => {
    const fetch = vi.fn((ruta: string) =>
      Promise.resolve(
        new Response(
          JSON.stringify(
            ruta === '/api/auth/login'
              ? { accessToken: 'jwt-de-prueba' }
              : ruta === '/api/auth/yo'
                ? usuarioDePrueba('PROFESOR')
                : [],
          ),
          { status: ruta === '/api/auth/refresh' ? 401 : 200 },
        ),
      ),
    )
    vi.stubGlobal('fetch', fetch)
    renderApp('/mis-cursos')
    await screen.findByRole('heading', { name: 'Bienvenido a CURSUS' })
    fireEvent.change(screen.getByLabelText('Correo institucional'), {
      target: { value: CORREO },
    })
    fireEvent.change(screen.getByLabelText('Contraseña'), {
      target: { value: PASSWORD },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }))
    expect(
      await screen.findByRole('heading', { name: 'Mis Cursos', level: 1 }),
    ).toBeInTheDocument()
    expect(llamadasMfa(fetch)).toHaveLength(0)
  })
})
