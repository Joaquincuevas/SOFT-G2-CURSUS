import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useNavigate } from 'react-router'
import {
  AVISO_SESION_EXPIRADA,
  AuthContext,
  pedirLogout,
  pedirToken,
  renovarToken,
} from './auth'

interface Props {
  children: ReactNode
  // Solo para tests: arranca con una sesión iniciada.
  initialToken?: string | null
}

export function AuthProvider({ children, initialToken = null }: Props) {
  const [token, setToken] = useState<string | null>(initialToken)
  const [restaurando, setRestaurando] = useState(initialToken === null)
  const [aviso, setAviso] = useState<string | null>(null)
  // JWT vigente, que cambia al renovar sin volver a renderizar.
  const vigente = useRef(initialToken)
  const navigate = useNavigate()

  const empezar = useCallback((nuevo: string) => {
    vigente.current = nuevo
    setAviso(null)
    setToken(nuevo)
  }, [])

  // Al cargar la app sin token, intenta restaurar la sesión con la cookie.
  useEffect(() => {
    if (initialToken) return
    let montado = true
    void renovarToken().then((nuevo) => {
      if (!montado) return
      if (nuevo) empezar(nuevo)
      setRestaurando(false)
    })
    return () => {
      montado = false
    }
  }, [initialToken, empezar])

  const cerrarSesion = useCallback(
    async (motivo?: string) => {
      // Ya cerrada: por ejemplo, SessionProvider no debe borrar el aviso que
      // dejó fetchConSesion al fallar la renovación.
      if (!vigente.current) return
      await pedirLogout()
      vigente.current = null
      setAviso(motivo ?? null)
      setToken(null)
      navigate('/login', { replace: true })
    },
    [navigate],
  )

  const fetchConSesion = useCallback(
    async (ruta: string, init: RequestInit = {}) => {
      const pedir = (jwt: string | null) =>
        fetch(ruta, {
          ...init,
          headers: { ...init.headers, Authorization: `Bearer ${jwt}` },
        })
      const respuesta = await pedir(vigente.current)
      if (respuesta.status !== 401) return respuesta

      const nuevo = await renovarToken()
      if (nuevo) {
        vigente.current = nuevo
        const reintento = await pedir(nuevo)
        if (reintento.status !== 401) return reintento
      }
      await cerrarSesion(AVISO_SESION_EXPIRADA)
      return respuesta
    },
    [cerrarSesion],
  )

  const value = useMemo(
    () => ({
      token,
      restaurando,
      aviso,
      iniciarSesion: async (correo: string, password: string) => {
        const nuevo = await pedirToken(correo, password)
        if (nuevo) empezar(nuevo)
        return nuevo !== null
      },
      cerrarSesion,
      fetchConSesion,
    }),
    [token, restaurando, aviso, empezar, cerrarSesion, fetchConSesion],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}
