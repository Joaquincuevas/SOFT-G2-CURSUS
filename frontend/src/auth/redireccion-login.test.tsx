import type { Rol } from '@cursus/shared'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation, type To } from 'react-router'
import { describe, expect, test, vi } from 'vitest'
import App from '../App'
import { SessionProvider } from '../session/SessionProvider'
import {
  abrirMenuUsuario,
  cerrarSesionDesdeElMenu,
  usuarioDePrueba,
} from '../test/sesion'
import { AuthProvider } from './AuthProvider'
import { destinoTrasLogin } from './retorno'

const jwt = (sub: string) => `h.${btoa(JSON.stringify({ sub }))}.firma`
const CUENTAS: Record<string, Rol> = {
  'profesor@norte.cursus.test': 'PROFESOR',
  'alumno@norte.cursus.test': 'ALUMNO',
  'director@norte.cursus.test': 'DIRECTOR',
}

// Backend simulado con varias cuentas: el login entrega un JWT con el id del
// usuario, /api/auth/yo devuelve la cuenta que inició sesión y, con
// `expirar`, /api/mis-cursos responde 401 (la renovación también).
function backend() {
  const estado = { rol: 'PROFESOR' as Rol, expirar: false }
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const responder = (cuerpo: unknown, status = 200) =>
        Promise.resolve(new Response(JSON.stringify(cuerpo), { status }))
      if (url === '/api/auth/login') {
        const { correo } = JSON.parse(String(init?.body)) as { correo: string }
        estado.rol = CUENTAS[correo]
        return responder({ accessToken: jwt(usuarioDePrueba(estado.rol).id) })
      }
      if (url === '/api/auth/refresh') return responder(null, 401)
      if (url === '/api/auth/logout')
        return Promise.resolve(new Response(null, { status: 204 }))
      if (url === '/api/auth/yo') return responder(usuarioDePrueba(estado.rol))
      if (estado.expirar) return responder(null, 401)
      return responder([])
    }),
  )
  return estado
}

function Ruta() {
  return <p data-testid="ruta">{useLocation().pathname}</p>
}

function abrir(
  entrada: To | { pathname: string; state: unknown },
  token: string | null = null,
) {
  render(
    <MemoryRouter initialEntries={[entrada]}>
      <AuthProvider initialToken={token}>
        <SessionProvider>
          <App />
          <Ruta />
        </SessionProvider>
      </AuthProvider>
    </MemoryRouter>,
  )
}

const ruta = () => screen.getByTestId('ruta').textContent
const pantallaLogin = () =>
  screen.findByRole('heading', { level: 1, name: 'Bienvenido a CURSUS' })
async function ingresar(correo: string) {
  await pantallaLogin()
  fireEvent.change(screen.getByLabelText('Correo institucional'), {
    target: { value: correo },
  })
  fireEvent.change(screen.getByLabelText('Contraseña'), {
    target: { value: 'cursus_demo' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }))
}
const enRuta = (esperada: string) =>
  waitFor(() => {
    expect(screen.queryByRole('banner')).toBeInTheDocument()
    expect(ruta()).toBe(esperada)
  })

describe('redirección tras iniciar sesión', () => {
  test.each(['alumno@norte.cursus.test', 'profesor@norte.cursus.test'])(
    'cerrar sesión en /perfil e ingresar con %s termina en /',
    async (correo) => {
      backend()
      abrir('/perfil', jwt('usuario-profesor'))
      await screen.findByRole('banner')
      await cerrarSesionDesdeElMenu()
      await pantallaLogin()
      expect(ruta()).toBe('/login')
      await ingresar(correo)
      await enRuta('/')
    },
  )

  test('un acceso directo sin sesión vuelve a esa ruta tras el login', async () => {
    backend()
    abrir('/mis-cursos')
    await ingresar('profesor@norte.cursus.test')
    await enRuta('/mis-cursos')
  })

  test('sin permiso para la ruta de retorno va a /', async () => {
    backend()
    abrir('/universidades')
    await ingresar('profesor@norte.cursus.test')
    await enRuta('/')
  })

  test.each([
    '//',
    '//evil.com',
    'https://evil.com/x',
    '/\\evil.com',
    'mis-cursos',
  ])('una ruta de retorno externa (%s) va a /', async (from) => {
    backend()
    abrir({ pathname: '/login', state: { from } })
    await ingresar('profesor@norte.cursus.test')
    await enRuta('/')
  })

  test('una sesión expirada vuelve a la ruta con la misma cuenta', async () => {
    const estado = backend()
    abrir('/', jwt('usuario-profesor'))
    await screen.findByRole('banner')
    estado.expirar = true
    await abrirMenuUsuario()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Mi perfil' }))
    await pantallaLogin()
    estado.expirar = false
    await ingresar('profesor@norte.cursus.test')
    await enRuta('/perfil')
  })

  test('una sesión expirada no lleva a otra cuenta a esa ruta', async () => {
    const estado = backend()
    abrir('/', jwt('usuario-profesor'))
    await screen.findByRole('banner')
    estado.expirar = true
    await abrirMenuUsuario()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Mi perfil' }))
    await pantallaLogin()
    estado.expirar = false
    await ingresar('alumno@norte.cursus.test')
    await enRuta('/')
  })
})

describe('destinoTrasLogin', () => {
  const ability = { can: () => true } as never
  test.each([
    ['/mis-cursos', true, '/mis-cursos'],
    ['/mis-cursos/123?x=1', true, '/mis-cursos/123?x=1'],
    ['/mis-cursos', false, '/'],
    ['//', true, '/'],
    ['///', true, '/'],
    ['//evil.com', true, '/'],
    ['/\\evil.com', true, '/'],
    ['/\t/evil.com', true, '/'],
    ['javascript:alert(1)', true, '/'],
    ['/no-existe', true, '/'],
    ['/login', true, '/'],
    [undefined, true, '/'],
  ])('%s (mismo usuario: %s) → %s', (from, mismo, esperado) => {
    expect(destinoTrasLogin(from, mismo, ability)).toBe(esperado)
  })
})
