import type { Rol, UsuarioSesion } from '@cursus/shared'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { vi } from 'vitest'
import App from '../App'
import { AuthProvider } from '../auth/AuthProvider'
import { SessionProvider } from '../session/SessionProvider'

// Usuarios de la Universidad Demo Norte del seed (backend/src/database/seed.ts),
// como los devuelve GET /api/auth/yo.
const USUARIOS: Record<
  Rol,
  Pick<UsuarioSesion, 'nombre' | 'universidadNombre' | 'facultadNombre'>
> = {
  DIRECTOR: {
    nombre: 'Director Norte',
    universidadNombre: 'Directorio',
    facultadNombre: null,
  },
  ADMINISTRATIVO: {
    nombre: 'Administrativo Ingeniería Norte',
    universidadNombre: 'Universidad Demo Norte',
    facultadNombre: 'Facultad de Ingeniería',
  },
  PROFESOR: {
    nombre: 'Profesor Norte',
    universidadNombre: 'Universidad Demo Norte',
    facultadNombre: 'Facultad de Ingeniería',
  },
  AYUDANTE: {
    nombre: 'Ayudante Norte',
    universidadNombre: 'Universidad Demo Norte',
    facultadNombre: 'Facultad de Ingeniería',
  },
  ALUMNO: {
    nombre: 'Alumno Norte',
    universidadNombre: 'Universidad Demo Norte',
    facultadNombre: 'Facultad de Ingeniería',
  },
}

export function usuarioDePrueba(rol: Rol): UsuarioSesion {
  return {
    id: `usuario-${rol.toLowerCase()}`,
    rol,
    universidadId: 'universidad-norte',
    // PERIODO del seed: año 2026, semestre 2.
    periodoActivo: { id: 'periodo-2026-2', anio: 2026, semestre: 2 },
    ...USUARIOS[rol],
  }
}

const json = (cuerpo: unknown) =>
  new Response(JSON.stringify(cuerpo), { status: 200 })

// Simula el backend: /api/auth/login entrega un token, /api/auth/refresh
// responde 401 (no hay cookie), /api/auth/logout 204 y /api/auth/yo devuelve
// el usuario del rol. Restaurar con vi.unstubAllGlobals().
export function simularBackend(rol: Rol) {
  const fetch = vi.fn((url: string) =>
    Promise.resolve(
      url === '/api/auth/login'
        ? json({ accessToken: 'jwt-de-prueba' })
        : url === '/api/auth/refresh'
          ? new Response(null, { status: 401 })
          : url === '/api/auth/logout'
            ? new Response(null, { status: 204 })
            : json(usuarioDePrueba(rol)),
    ),
  )
  vi.stubGlobal('fetch', fetch)
  return fetch
}

export function renderApp(path: string, initialToken: string | null = null) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider initialToken={initialToken}>
        <SessionProvider>
          <App />
        </SessionProvider>
      </AuthProvider>
    </MemoryRouter>,
  )
}

// Renderiza la app con la sesión ya iniciada y espera a que cargue el menú.
export async function renderConSesion(rol: Rol, path = '/') {
  simularBackend(rol)
  renderApp(path, 'jwt-de-prueba')
  return screen.findByRole('navigation', { name: 'Navegación principal' })
}
