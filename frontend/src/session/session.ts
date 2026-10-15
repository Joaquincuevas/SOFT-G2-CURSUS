import type { Rol } from '@cursus/shared'
import { createContext, useContext } from 'react'

// Sesión simulada hasta que AUTH-06 conecte la real. Vive solo en memoria:
// sin localStorage ni tokens.

export interface SessionUser {
  id: string
  nombre: string
  rol: Rol
  universidadId: string
}

export interface SessionValue {
  user: SessionUser
  setRol: (rol: Rol) => void
  logout: () => void
}

export const DEFAULT_ROL: Rol = 'ALUMNO'

export function mockUser(rol: Rol): SessionUser {
  return {
    id: `mock-${rol.toLowerCase()}`,
    nombre: 'Usuario de prueba',
    rol,
    universidadId: 'mock-universidad',
  }
}

export const SessionContext = createContext<SessionValue | null>(null)

export function useSession(): SessionValue {
  const session = useContext(SessionContext)
  if (!session)
    throw new Error('useSession debe usarse dentro de SessionProvider')
  return session
}
