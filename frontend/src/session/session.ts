import type { Accion, AppAbility, Sujeto, UsuarioSesion } from '@cursus/shared'
import { createContext, useContext } from 'react'

// Sesión del usuario: sus datos de GET /api/auth/yo y su ability de CASL.

export type SessionUser = UsuarioSesion

export interface SessionValue {
  user: SessionUser
  ability: AppAbility
}

// null mientras no hay sesión o todavía no llega /api/auth/yo.
export const SessionContext = createContext<SessionValue | null>(null)

// Solo dentro de las rutas protegidas (RequireAuth), donde la sesión ya cargó.
export function useSession(): SessionValue {
  const session = useContext(SessionContext)
  if (!session)
    throw new Error('useSession debe usarse dentro de una ruta con sesión')
  return session
}

// Para mostrar u ocultar acciones dentro de una página según los permisos
// sobre tablas, por ejemplo usePuede('create', 'Curso').
export function usePuede(accion: Accion, sujeto: Sujeto): boolean {
  return useSession().ability.can(accion, sujeto)
}

// GET /api/auth/yo. Devuelve null si el token no es válido o el backend no
// responde.
export async function pedirUsuario(token: string): Promise<SessionUser | null> {
  try {
    const respuesta = await fetch('/api/auth/yo', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!respuesta.ok) return null
    return (await respuesta.json()) as SessionUser
  } catch {
    return null
  }
}
