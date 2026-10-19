import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { AuthContext, pedirToken } from './auth'

interface Props {
  children: ReactNode
  // Solo para tests: arranca con una sesión iniciada.
  initialToken?: string | null
}

export function AuthProvider({ children, initialToken = null }: Props) {
  const [token, setToken] = useState<string | null>(initialToken)
  const navigate = useNavigate()

  const value = useMemo(
    () => ({
      token,
      iniciarSesion: async (correo: string, password: string) => {
        const nuevo = await pedirToken(correo, password)
        if (nuevo) setToken(nuevo)
        return nuevo !== null
      },
      // Por ahora solo olvida el token en memoria. AUTH-03 agrega aquí la
      // invalidación en el backend.
      cerrarSesion: () => {
        setToken(null)
        navigate('/login', { replace: true })
      },
    }),
    [token, navigate],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}
