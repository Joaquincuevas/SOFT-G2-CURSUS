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
    // Correos del seed (backend/src/database/seed.ts).
    correo:
      rol === 'ADMINISTRATIVO'
        ? 'administrativo.ingenieria@norte.cursus.test'
        : `${rol.toLowerCase()}@norte.cursus.test`,
    rol,
    universidadId: 'universidad-norte',
    debeCambiarPassword: false,
    // PERIODO del seed: año 2026, semestre 2.
    periodoActivo: { id: 'periodo-2026-2', anio: 2026, semestre: 2 },
    ...USUARIOS[rol],
  }
}

export const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status })

// Respuesta simulada de una ruta de la API: un Response, o un cuerpo JSON que
// responde 200 (o una promesa de cualquiera de los dos, para una respuesta que
// tarda). Recibe la URL completa, con su query (por ejemplo, los filtros
// de /api/cursos).
export type RutaSimulada = (init?: RequestInit, url?: string) => unknown

// Listas de gestión académica y del dashboard del profesor (ESP-01) y del
// ayudante (ESP-02): vacías salvo que el test las simule.
const LISTAS_VACIAS: Record<string, RutaSimulada> = {
  '/api/carreras': () => [],
  '/api/periodos': () => [],
  '/api/cursos': () => [],
  '/api/dashboard/mis-secciones': () => [],
  '/api/dashboard/secciones-ayudante': () => [],
  '/api/dashboard/secciones-alumno': () => [],
}

// Rutas con un id en el medio, que no se pueden comparar exactas. Lista de
// alumnos de una sección para su profesor (ESP-05): vacía salvo que el test
// la simule.
const RUTAS_VACIAS_CON_ID: [RegExp, RutaSimulada][] = [
  [
    /^\/api\/espacio\/secciones\/[^/]+\/alumnos$/,
    () => ({ total: 0, alumnos: [] }),
  ],
  // Clases de la sección (ASI-01).
  [/^\/api\/espacio\/secciones\/[^/]+\/clases$/, () => []],
  // Asistencia de una clase (ASI-02): sin registrar y sin alumnos.
  [
    /^\/api\/espacio\/secciones\/[^/]+\/clases\/[^/]+\/asistencia$/,
    () => ({
      clase: {
        id: 'clase',
        fecha: '2026-09-14',
        inicio: '08:30',
        termino: '10:00',
        sala: 'Sala',
      },
      registrada: null,
      alumnos: [],
    }),
  ],
  // Evaluaciones de la sección (NOT-01).
  [
    /^\/api\/espacio\/secciones\/[^/]+\/evaluaciones$/,
    () => ({ evaluaciones: [], sumaPonderaciones: 0 }),
  ],
  // Notas de una evaluación (NOT-05).
  [
    /^\/api\/espacio\/secciones\/[^/]+\/evaluaciones\/[^/]+\/notas$/,
    () => ({
      evaluacion: { id: 'e', nombre: '', fecha: '', ponderacion: 0 },
      alumnos: [],
    }),
  ],
  // Anuncios del curso de la sección (ANU-01).
  [/^\/api\/espacio\/secciones\/[^/]+\/anuncios$/, () => []],
  [
    /^\/api\/espacio\/secciones\/[^/]+\/anuncios\/lecturas$/,
    () => new Response(null, { status: 204 }),
  ],
  // Actividades de entrega de la sección (MAT-08).
  [/^\/api\/espacio\/secciones\/[^/]+\/actividades$/, () => []],
]

// Simula el backend: /api/auth/login entrega un token, /api/auth/refresh
// responde 401 (no hay cookie), /api/auth/logout 204, cada ruta de `rutas`
// (comparada sin la query) responde lo que devuelva, las listas de gestión
// responden vacías y el resto (/api/auth/yo) devuelve el usuario del rol.
// Restaurar con vi.unstubAllGlobals().
export function simularBackend(
  rol: Rol,
  rutas: Record<string, RutaSimulada> = {},
) {
  const simuladas = { ...LISTAS_VACIAS, ...rutas }
  const fetch = vi.fn((url: string, init?: RequestInit) => {
    const ruta = url.split('?')[0]
    const simulada =
      simuladas[ruta] ??
      RUTAS_VACIAS_CON_ID.find(([patron]) => patron.test(ruta))?.[1]
    if (simulada) {
      return Promise.resolve(simulada(init, url)).then((respuesta) =>
        respuesta instanceof Response ? respuesta : json(respuesta),
      )
    }
    return Promise.resolve(
      url === '/api/auth/login'
        ? json({ accessToken: 'jwt-de-prueba' })
        : url === '/api/auth/refresh'
          ? new Response(null, { status: 401 })
          : url === '/api/auth/logout'
            ? new Response(null, { status: 204 })
            : json(usuarioDePrueba(rol)),
    )
  })
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
export async function renderConSesion(
  rol: Rol,
  path = '/',
  rutas: Record<string, RutaSimulada> = {},
) {
  simularBackend(rol, rutas)
  renderApp(path, 'jwt-de-prueba')
  return screen.findByRole('navigation', { name: 'Navegación principal' })
}
