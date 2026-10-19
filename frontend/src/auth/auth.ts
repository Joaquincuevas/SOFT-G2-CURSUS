import { createContext, useContext } from 'react'

// Sesión real (AUTH-01): el JWT vive solo en memoria, sin localStorage ni
// cookies, así que se pierde al recargar la página hasta AUTH-04 (refresh).

export interface AuthValue {
  token: string | null
  // Devuelve true si el backend aceptó las credenciales.
  iniciarSesion: (correo: string, password: string) => Promise<boolean>
  // Único punto de cierre de sesión: todo logout pasa por aquí.
  cerrarSesion: () => void
}

export const AuthContext = createContext<AuthValue | null>(null)

export function useAuth(): AuthValue {
  const auth = useContext(AuthContext)
  if (!auth) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return auth
}

// POST /api/auth/login. Devuelve el JWT, o null si las credenciales no son
// válidas o el backend no responde.
export async function pedirToken(
  correo: string,
  password: string,
): Promise<string | null> {
  try {
    const respuesta = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ correo, password }),
    })
    if (!respuesta.ok) return null
    const { accessToken } = (await respuesta.json()) as { accessToken: string }
    return accessToken
  } catch {
    return null
  }
}
