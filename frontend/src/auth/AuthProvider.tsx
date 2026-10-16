import { useMemo, useState, type ReactNode } from 'react'
import { AuthContext, pedirToken } from './auth'

interface Props {
  children: ReactNode
  // Solo para tests: arranca con una sesión iniciada.
  initialToken?: string | null
}

export function AuthProvider({ children, initialToken = null }: Props) {
  const [token, setToken] = useState<string | null>(initialToken)

  const value = useMemo(
    () => ({
      token,
      iniciarSesion: async (correo: string, password: string) => {
        const nuevo = await pedirToken(correo, password)
        if (nuevo) setToken(nuevo)
        return nuevo !== null
      },
    }),
    [token],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}
