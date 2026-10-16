import type { Rol } from '@cursus/shared'
import { createContext, useContext } from 'react'

// Sesión simulada hasta que AUTH-06 conecte la real. Vive solo en memoria:
// sin localStorage ni tokens.

export interface SessionUser {
  id: string
  nombre: string
  rol: Rol
  universidadId: string
  universidadNombre: string
  // Solo el administrativo pertenece a una facultad en esta vista.
  facultadNombre?: string
  periodo: string
}

export interface SessionValue {
  user: SessionUser
  setRol: (rol: Rol) => void
  logout: () => void
}

export const DEFAULT_ROL: Rol = 'ALUMNO'

// Nombres de la Universidad Demo Norte del seed (backend/src/database/seed.ts).
// El director ve todas las universidades: el Figma lo muestra como "Directorio".
const MOCK_USERS: Record<
  Rol,
  Pick<SessionUser, 'nombre' | 'universidadNombre' | 'facultadNombre'>
> = {
  DIRECTOR: { nombre: 'Director Norte', universidadNombre: 'Directorio' },
  ADMINISTRATIVO: {
    nombre: 'Administrativo Ingeniería Norte',
    universidadNombre: 'Universidad Demo Norte',
    facultadNombre: 'Facultad de Ingeniería',
  },
  PROFESOR: {
    nombre: 'Profesor Norte',
    universidadNombre: 'Universidad Demo Norte',
  },
  AYUDANTE: {
    nombre: 'Ayudante Norte',
    universidadNombre: 'Universidad Demo Norte',
  },
  ALUMNO: {
    nombre: 'Alumno Norte',
    universidadNombre: 'Universidad Demo Norte',
  },
}

export function mockUser(rol: Rol): SessionUser {
  return {
    id: `mock-${rol.toLowerCase()}`,
    rol,
    universidadId: 'mock-universidad',
    // PERIODO del seed: año 2026, semestre 2.
    periodo: '2026-2',
    ...MOCK_USERS[rol],
  }
}

export const SessionContext = createContext<SessionValue | null>(null)

export function useSession(): SessionValue {
  const session = useContext(SessionContext)
  if (!session)
    throw new Error('useSession debe usarse dentro de SessionProvider')
  return session
}
