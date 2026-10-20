import type { Accion, AppAbility, Sujeto, UsuarioSesion } from '@cursus/shared'
import { createContext, useContext } from 'react'

// Sesión del usuario: sus datos de GET /api/auth/yo y su ability de CASL.

export type SessionUser = UsuarioSesion

export interface SessionValue {
  user: SessionUser
  ability: AppAbility
  actualizarPeriodoActivo: (periodo: SessionUser['periodoActivo']) => void
  // PER-01: el encabezado muestra el nombre nuevo sin volver a pedir la sesión.
  actualizarNombre: (nombre: string) => void
  // PER-03: al cambiar la contraseña provisoria se quita la marca, sin volver
  // a pedir la sesión.
  marcarPasswordCambiada: () => void
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

// GET /api/auth/yo con el fetch de la sesión (AuthValue.fetchConSesion).
// Devuelve null si el backend lo rechaza o no responde.
export async function pedirUsuario(
  fetchConSesion: (ruta: string) => Promise<Response>,
): Promise<SessionUser | null> {
  try {
    const respuesta = await fetchConSesion('/api/auth/yo')
    if (!respuesta.ok) return null
    return (await respuesta.json()) as SessionUser
  } catch {
    return null
  }
}
