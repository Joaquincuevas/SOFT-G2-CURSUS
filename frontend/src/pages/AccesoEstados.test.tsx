import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { AVISO_SESION_EXPIRADA } from '../auth/auth'
import {
  json,
  renderApp,
  simularBackend,
  usuarioDePrueba,
} from '../test/sesion'

// UI/UX-L: los estados de las pantallas de acceso (login, verificación en dos
// pasos, cambio obligatorio y recuperación): carga, error, bloqueo, aviso,
// campo inválido, teclado y accesibilidad. La lógica de autenticación la
// cubren Login.test, LoginMfa.test, limite-login.test y refresh.test.
afterEach(() => {
  vi.unstubAllGlobals()
})

const respuesta = (status: number, cuerpo: object = {}, h: HeadersInit = {}) =>
  new Response(JSON.stringify(cuerpo), { status, headers: h })

function simularLogin(login: () => Promise<Response> | Response) {
  const fetch = vi.fn((ruta: string) =>
    ruta === '/api/auth/login'
      ? Promise.resolve(login())
      : Promise.resolve(new Response(null, { status: 401 })),
  )
  vi.stubGlobal('fetch', fetch)
  return fetch
}
const llamadasAlLogin = (fetch: ReturnType<typeof vi.fn>) =>
  fetch.mock.calls.filter(([ruta]) => ruta === '/api/auth/login')

const correo = () => screen.getByLabelText('Correo institucional')
const password = () => screen.getByLabelText('Contraseña')
const ingresar = () => screen.getByRole('button', { name: 'Ingresar' })
const escribir = (campo: HTMLElement, valor: string) =>
  fireEvent.change(campo, { target: { value: valor } })

async function abrirLogin() {
  renderApp('/login')
  await screen.findByRole('heading', { name: 'Bienvenido a CURSUS' })
}

describe('login: estructura', () => {
  test('lleva el panel de marca y un solo botón de envío: Enter envía el formulario', async () => {
    simularLogin(() => respuesta(401))
    await abrirLogin()
    expect(screen.getByRole('complementary')).toHaveTextContent('CURSUS')
    const formulario = ingresar().closest('form')!
    expect(formulario).toContainElement(correo())
    expect(formulario).toContainElement(password())
    // Un solo botón de envío: es el que usa Enter desde cualquier campo.
    expect(formulario.querySelectorAll('button[type="submit"]')).toHaveLength(1)
    expect(
      screen.getByRole('button', { name: 'Mostrar contraseña' }),
    ).toHaveAttribute('type', 'button')
  })

  test('el orden de tabulación es lógico: correo, contraseña, mostrar, ingresar, olvidé', async () => {
    simularLogin(() => respuesta(401))
    await abrirLogin()
    const orden = Array.from(
      screen
        .getByRole('main')
        .querySelectorAll<HTMLElement>('input, button, a[href]'),
    ).map(
      (control) => control.getAttribute('aria-label') ?? control.textContent,
    )
    expect(orden).toEqual([
      '',
      '',
      'Mostrar contraseña',
      'Ingresar',
      '¿Olvidaste tu contraseña?',
    ])
    expect(
      Array.from(
        screen.getByRole('main').querySelectorAll<HTMLElement>('*'),
      ).every((el) => el.tabIndex <= 0),
    ).toBe(true)
    expect(correo()).toHaveAttribute('name', 'correo')
    expect(password()).toHaveAttribute('name', 'password')
  })

  test('los campos tienen su etiqueta, autocompletado y foco visible', async () => {
    simularLogin(() => respuesta(401))
    await abrirLogin()
    expect(correo()).toHaveAttribute('autocomplete', 'username')
    expect(password()).toHaveAttribute('autocomplete', 'current-password')
    expect(correo()).toHaveClass('focus-visible:ring-[3px]')
    expect(ingresar()).toHaveClass('focus-visible:ring-[3px]')
  })
})

describe('login: campo inválido', () => {
  test('con los campos vacíos avisa junto a cada campo, sin pedirle nada a la API, y enfoca el primero', async () => {
    const fetch = simularLogin(() => respuesta(401))
    await abrirLogin()
    fireEvent.click(ingresar())

    expect(correo()).toHaveAttribute('aria-invalid', 'true')
    expect(correo()).toHaveAccessibleDescription(
      'Ingresa tu correo institucional.',
    )
    expect(password()).toHaveAttribute('aria-invalid', 'true')
    expect(password()).toHaveAccessibleDescription('Ingresa tu contraseña.')
    expect(correo()).toHaveFocus()
    expect(llamadasAlLogin(fetch)).toHaveLength(0)
  })

  test('un correo mal escrito se explica y enfoca el correo', async () => {
    const fetch = simularLogin(() => respuesta(401))
    await abrirLogin()
    escribir(correo(), 'pedro.soto')
    escribir(password(), 'una-clave')
    fireEvent.click(ingresar())
    expect(correo()).toBeInvalid()
    expect(correo()).toHaveAccessibleDescription(
      'Ingresa un correo válido, por ejemplo pedro.soto@universidad.cl.',
    )
    expect(password()).not.toHaveAttribute('aria-invalid')
    expect(correo()).toHaveFocus()
    expect(llamadasAlLogin(fetch)).toHaveLength(0)
  })

  test('solo falta la contraseña: se enfoca y el correo queda sin marca', async () => {
    simularLogin(() => respuesta(401))
    await abrirLogin()
    escribir(correo(), 'profesor@norte.cursus.test')
    fireEvent.click(ingresar())
    expect(password()).toBeInvalid()
    expect(password()).toHaveFocus()
    expect(correo()).not.toHaveAttribute('aria-invalid')
  })

  test('al escribir en el campo se quita su aviso', async () => {
    simularLogin(() => respuesta(401))
    await abrirLogin()
    fireEvent.click(ingresar())
    expect(correo()).toBeInvalid()
    escribir(correo(), 'p')
    expect(correo()).not.toHaveAttribute('aria-invalid')
    expect(screen.queryByText('Ingresa tu correo institucional.')).toBeNull()
    expect(password()).toBeInvalid()
  })
})

describe('login: carga, error, bloqueo y aviso', () => {
  test('mientras envía, el botón se deshabilita y muestra un spinner', async () => {
    let responder!: (r: Response) => void
    simularLogin(
      () =>
        new Promise<Response>((resolver) => {
          responder = resolver
        }),
    )
    await abrirLogin()
    escribir(correo(), 'profesor@norte.cursus.test')
    escribir(password(), 'una-clave')
    expect(ingresar().querySelector('svg.animate-spin')).toBeNull()
    fireEvent.click(ingresar())

    await waitFor(() => expect(ingresar()).toBeDisabled())
    expect(ingresar().querySelector('svg.animate-spin')).not.toBeNull()
    expect(ingresar().querySelector('svg')).toHaveAttribute(
      'aria-hidden',
      'true',
    )

    responder(respuesta(401))
    await waitFor(() => expect(ingresar()).toBeEnabled())
    expect(ingresar().querySelector('svg.animate-spin')).toBeNull()
  })

  test('credenciales incorrectas: alerta de error y los dos campos quedan marcados', async () => {
    simularLogin(() => respuesta(401))
    await abrirLogin()
    escribir(correo(), 'profesor@norte.cursus.test')
    escribir(password(), 'incorrecta')
    fireEvent.click(ingresar())

    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveAttribute('data-variant', 'danger')
    expect(correo()).toHaveAttribute('aria-invalid', 'true')
    expect(password()).toHaveAttribute('aria-invalid', 'true')
    expect(password()).toHaveAttribute('aria-describedby', alerta.id)
  })

  test('cuenta bloqueada o intentos agotados: alerta de advertencia, sin marcar los campos', async () => {
    simularLogin(() => respuesta(429, {}, { 'Retry-After': '600' }))
    await abrirLogin()
    escribir(correo(), 'profesor@norte.cursus.test')
    escribir(password(), 'incorrecta')
    fireEvent.click(ingresar())

    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveAttribute('data-variant', 'warning')
    expect(alerta).toHaveTextContent(
      'Espera 10 minutos antes de volver a intentar',
    )
    expect(correo()).not.toHaveAttribute('aria-invalid')
    expect(password()).not.toHaveAttribute('aria-invalid')
    expect(password()).toHaveAccessibleDescription(/Espera 10 minutos/)
  })

  test('la sesión que expiró se avisa como información, con role alert', async () => {
    simularBackend('PROFESOR', {
      '/api/auth/yo': () => respuesta(401),
    })
    // Una sesión iniciada cuyo refresh falla vuelve al login con el aviso.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(null, { status: 401 }))),
    )
    renderApp('/mis-cursos', 'jwt-vencido')
    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveAttribute('data-variant', 'info')
    expect(alerta).toHaveTextContent(AVISO_SESION_EXPIRADA)
    expect(correo()).not.toHaveAttribute('aria-invalid')
  })
})

describe('verificación en dos pasos: estados', () => {
  const DESAFIO = 'desafio.firmado.de-prueba'
  function simularMfa(paso2: () => Promise<Response> | Response) {
    vi.stubGlobal(
      'fetch',
      vi.fn((ruta: string) => {
        if (ruta === '/api/auth/login')
          return Promise.resolve(json({ mfaRequerido: true, desafio: DESAFIO }))
        if (ruta === '/api/auth/login/mfa') return Promise.resolve(paso2())
        return Promise.resolve(new Response(null, { status: 401 }))
      }),
    )
  }
  async function aPaso2() {
    await abrirLogin()
    escribir(correo(), 'profesor@norte.cursus.test')
    escribir(password(), 'contraseña-correcta')
    fireEvent.click(ingresar())
    await screen.findByRole('heading', { name: 'Verificación en dos pasos' })
  }
  const codigo = () => screen.getByLabelText('Código de verificación')
  const verificar = () => screen.getByRole('button', { name: /Verific/ })

  test('lleva el panel de marca, el campo numérico y el foco, con el botón de envío único', async () => {
    simularMfa(() => respuesta(401))
    await aPaso2()
    expect(screen.getByRole('complementary')).toBeInTheDocument()
    expect(codigo()).toHaveAttribute('inputmode', 'numeric')
    expect(codigo()).toHaveAttribute('autocomplete', 'one-time-code')
    expect(codigo()).toHaveFocus()
    expect(
      verificar().closest('form')!.querySelectorAll('button[type="submit"]'),
    ).toHaveLength(1)
    expect(
      screen.getByRole('button', { name: 'Volver al inicio de sesión' }),
    ).toHaveAttribute('type', 'button')
  })

  test('un código incompleto marca el campo como inválido y lo describe', async () => {
    simularMfa(() => respuesta(401))
    await aPaso2()
    escribir(codigo(), '12')
    fireEvent.click(verificar())
    const alerta = screen.getByRole('alert')
    expect(alerta).toHaveAttribute('data-variant', 'danger')
    expect(codigo()).toHaveAttribute('aria-invalid', 'true')
    expect(codigo()).toHaveAttribute('aria-describedby', alerta.id)
    expect(codigo()).toHaveFocus()
  })

  test('mientras verifica, deshabilita el botón con un spinner', async () => {
    let responder!: (r: Response) => void
    simularMfa(
      () =>
        new Promise<Response>((resolver) => {
          responder = resolver
        }),
    )
    await aPaso2()
    escribir(codigo(), '123456')
    fireEvent.click(verificar())
    const boton = await screen.findByRole('button', { name: 'Verificando…' })
    expect(boton).toBeDisabled()
    expect(boton.querySelector('svg.animate-spin')).not.toBeNull()
    responder(respuesta(401, { code: 'MFA_CODIGO_INVALIDO' }))
    await screen.findByRole('button', { name: 'Verificar' })
  })

  test('un código inválido es un error; el bloqueo, una advertencia', async () => {
    simularMfa(() => respuesta(401, { code: 'MFA_CODIGO_INVALIDO' }))
    await aPaso2()
    escribir(codigo(), '123456')
    fireEvent.click(verificar())
    expect(await screen.findByRole('alert')).toHaveAttribute(
      'data-variant',
      'danger',
    )
  })

  test('el bloqueo por demasiados intentos es una advertencia y cierra el campo', async () => {
    simularMfa(() => respuesta(429, {}, { 'Retry-After': '600' }))
    await aPaso2()
    escribir(codigo(), '123456')
    fireEvent.click(verificar())
    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveAttribute('data-variant', 'warning')
    expect(codigo()).toBeDisabled()
  })

  test('si la verificación expiró, vuelve al login con un aviso informativo', async () => {
    simularMfa(() => respuesta(401, { code: 'MFA_DESAFIO_INVALIDO' }))
    await aPaso2()
    escribir(codigo(), '123456')
    fireEvent.click(verificar())
    await screen.findByRole('heading', { name: 'Bienvenido a CURSUS' })
    expect(screen.getByRole('alert')).toHaveAttribute('data-variant', 'info')
    expect(screen.getByRole('alert')).toHaveTextContent(
      'La verificación expiró',
    )
  })
})

describe('cambio obligatorio de contraseña: estados', () => {
  const PROVISORIO = { ...usuarioDePrueba('ALUMNO'), debeCambiarPassword: true }
  const campo = (nombre: string) =>
    screen.getByLabelText(nombre) as HTMLInputElement
  async function abrir(rutas = {}) {
    simularBackend('ALUMNO', { '/api/auth/yo': () => PROVISORIO, ...rutas })
    renderApp('/', 'jwt-de-prueba')
    await screen.findByRole('heading', { name: 'Cambia tu contraseña' })
  }
  function llenar(actual: string, nueva: string, repetida: string) {
    escribir(campo('Contraseña provisoria'), actual)
    escribir(campo('Contraseña nueva'), nueva)
    escribir(campo('Repetir contraseña nueva'), repetida)
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }))
  }

  test('comparte la estructura del login y cada contraseña se puede mostrar u ocultar', async () => {
    await abrir()
    expect(screen.getByRole('complementary')).toBeInTheDocument()
    for (const nombre of [
      'contraseña provisoria',
      'contraseña nueva',
      'repetir contraseña nueva',
    ]) {
      fireEvent.click(screen.getByRole('button', { name: `Mostrar ${nombre}` }))
    }
    expect(campo('Contraseña provisoria')).toHaveAttribute('type', 'text')
    expect(campo('Contraseña nueva')).toHaveAttribute('type', 'text')
    expect(campo('Repetir contraseña nueva')).toHaveAttribute('type', 'text')
    expect(
      screen
        .getByRole('button', { name: 'Cambiar contraseña' })
        .closest('form')!
        .querySelectorAll('button[type="submit"]'),
    ).toHaveLength(1)
  })

  test('la contraseña nueva demasiado corta marca ese campo', async () => {
    await abrir()
    llenar('provisoria-1', 'corta', 'corta')
    const alerta = screen.getByRole('alert')
    expect(alerta).toHaveAttribute('data-variant', 'danger')
    expect(campo('Contraseña nueva')).toHaveAttribute('aria-invalid', 'true')
    expect(campo('Contraseña provisoria')).not.toHaveAttribute('aria-invalid')
    expect(campo('Contraseña nueva')).toHaveAccessibleDescription(
      /Debe tener al menos.*caracteres\..*al menos/s,
    )
  })

  test('las contraseñas que no coinciden marcan la repetición', async () => {
    await abrir()
    llenar('provisoria-1', 'contraseña-nueva', 'otra-contraseña')
    expect(screen.getByRole('alert')).toHaveTextContent('no coinciden')
    expect(campo('Repetir contraseña nueva')).toBeInvalid()
    expect(campo('Contraseña nueva')).not.toHaveAttribute('aria-invalid')
  })

  test('una nueva igual a la provisoria marca la contraseña nueva', async () => {
    await abrir()
    llenar('misma-contraseña', 'misma-contraseña', 'misma-contraseña')
    expect(screen.getByRole('alert')).toHaveTextContent('distinta de la actual')
    expect(campo('Contraseña nueva')).toBeInvalid()
  })

  test('un error de la API no marca ningún campo, y el bloqueo es una advertencia', async () => {
    await abrir({
      '/api/auth/password': () =>
        respuesta(400, { message: 'La contraseña actual no es correcta' }),
    })
    llenar('mala', 'contraseña-nueva', 'contraseña-nueva')
    expect(await screen.findByRole('alert')).toHaveAttribute(
      'data-variant',
      'danger',
    )
    expect(campo('Contraseña provisoria')).not.toHaveAttribute('aria-invalid')
    expect(campo('Contraseña nueva')).not.toHaveAttribute('aria-invalid')
    expect(campo('Repetir contraseña nueva')).not.toHaveAttribute(
      'aria-invalid',
    )
  })

  test('demasiados intentos es una advertencia', async () => {
    await abrir({
      '/api/auth/password': () => respuesta(429, {}, { 'Retry-After': '600' }),
    })
    llenar('mala', 'contraseña-nueva', 'contraseña-nueva')
    expect(await screen.findByRole('alert')).toHaveAttribute(
      'data-variant',
      'warning',
    )
  })

  test('mientras guarda, deshabilita el botón con un spinner', async () => {
    let responder!: (r: Response) => void
    await abrir({
      '/api/auth/password': () =>
        new Promise<Response>((resolver) => {
          responder = resolver
        }),
    })
    llenar('provisoria-1', 'contraseña-nueva', 'contraseña-nueva')
    const boton = await screen.findByRole('button', { name: 'Guardando…' })
    expect(boton).toBeDisabled()
    expect(boton.querySelector('svg.animate-spin')).not.toBeNull()
    responder(respuesta(400, { message: 'x' }))
    await screen.findByRole('button', { name: 'Cambiar contraseña' })
  })
})

describe('recuperación de contraseña: estados', () => {
  const TOKEN = 'a'.repeat(64)
  const sinConexion = () =>
    vi.stubGlobal(
      'fetch',
      vi.fn((ruta: string) =>
        Promise.resolve(
          new Response(null, {
            status:
              ruta.startsWith('/api/auth/') && ruta.includes('password')
                ? 500
                : 401,
          }),
        ),
      ),
    )

  test('pedir el enlace lleva el panel de marca, y un fallo del servidor es un error', async () => {
    sinConexion()
    renderApp('/recuperar-password')
    await screen.findByRole('heading', { name: 'Recupera tu contraseña' })
    expect(screen.getByRole('complementary')).toBeInTheDocument()
    escribir(
      screen.getByLabelText('Correo institucional'),
      'a@norte.cursus.test',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Enviar enlace' }))
    expect(await screen.findByRole('alert')).toHaveAttribute(
      'data-variant',
      'danger',
    )
    expect(
      screen.getByRole('link', { name: 'Volver al inicio de sesión' }),
    ).toHaveAttribute('href', '/login')
  })

  test('el enlace enviado se confirma con un aviso de éxito', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((ruta: string) =>
        Promise.resolve(
          new Response(null, {
            status: ruta === '/api/auth/recuperar-password' ? 204 : 401,
          }),
        ),
      ),
    )
    renderApp('/recuperar-password')
    escribir(
      await screen.findByLabelText('Correo institucional'),
      'a@norte.cursus.test',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Enviar enlace' }))
    const aviso = await screen.findByRole('status')
    expect(aviso).toHaveAttribute('data-variant', 'success')
    expect(aviso).toHaveTextContent('Si existe una cuenta asociada')
  })

  test('restablecer: las contraseñas distintas marcan la confirmación', async () => {
    sinConexion()
    renderApp(`/restablecer-password#${TOKEN}`)
    escribir(
      await screen.findByLabelText('Nueva contraseña'),
      'contraseña nueva',
    )
    escribir(screen.getByLabelText('Confirma la contraseña'), 'otra contraseña')
    fireEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }))
    const alerta = screen.getByRole('alert')
    expect(alerta).toHaveTextContent('Las contraseñas deben coincidir')
    expect(screen.getByLabelText('Confirma la contraseña')).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    expect(screen.getByLabelText('Nueva contraseña')).not.toHaveAttribute(
      'aria-invalid',
    )
    expect(
      within(screen.getByRole('main')).getByRole('button', {
        name: 'Mostrar nueva contraseña',
      }),
    ).toBeInTheDocument()
  })

  test('un enlace inválido es un error y no muestra el formulario', async () => {
    sinConexion()
    renderApp('/restablecer-password#invalido')
    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveAttribute('data-variant', 'danger')
    expect(screen.queryByLabelText('Nueva contraseña')).toBeNull()
  })
})
