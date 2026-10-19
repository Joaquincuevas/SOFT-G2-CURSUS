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
  SESION_CERRADA,
  LoginLimitado,
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
  const generacion = useRef(0)
  const cierreEnCurso = useRef<Promise<void> | null>(null)
  // useNavigate() cambia de identidad al navegar (BrowserRouter). Si
  // cerrarSesion y fetchConSesion dependieran de él, también cambiarían en
  // cada navegación, y los efectos que los usan volverían a pedir sus datos.
  // Se guarda en una ref para que las dos funciones sean estables.
  const navigate = useNavigate()
  const navegar = useRef(navigate)
  useEffect(() => {
    navegar.current = navigate
  }, [navigate])

  const empezar = useCallback((nuevo: string) => {
    localStorage.removeItem(SESION_CERRADA)
    vigente.current = nuevo
    setAviso(null)
    setToken(nuevo)
  }, [])

  // Al cargar la app sin token, intenta restaurar la sesión con la cookie.
  useEffect(() => {
    if (initialToken) return
    let montado = true
    const version = generacion.current
    void renovarToken().then((nuevo) => {
      if (!montado || version !== generacion.current) return
      if (nuevo) empezar(nuevo)
      setRestaurando(false)
    })
    return () => {
      montado = false
    }
  }, [initialToken, empezar])

  const cerrarSesion = useCallback(async (motivo?: string) => {
    // Ya cerrada: por ejemplo, SessionProvider no debe borrar el aviso que
    // dejó fetchConSesion al fallar la renovación.
    if (!vigente.current) return
    generacion.current += 1
    localStorage.setItem(SESION_CERRADA, '1')
    vigente.current = null
    setAviso(motivo ?? null)
    setToken(null)
    setRestaurando(false)
    navegar.current('/login', { replace: true })
    cierreEnCurso.current = pedirLogout()
    await cierreEnCurso.current
  }, [])

  useEffect(() => {
    const alCerrarEnOtraPestana = (event: StorageEvent) => {
      if (event.key !== SESION_CERRADA || !event.newValue) return
      generacion.current += 1
      vigente.current = null
      setToken(null)
      setRestaurando(false)
      setAviso(null)
      navegar.current('/login', { replace: true })
    }
    window.addEventListener('storage', alCerrarEnOtraPestana)
    return () => window.removeEventListener('storage', alCerrarEnOtraPestana)
  }, [])

  const fetchConSesion = useCallback(
    async (ruta: string, init: RequestInit = {}) => {
      const version = generacion.current
      const cerrada = () => version !== generacion.current || !vigente.current
      if (cerrada()) return new Response(null, { status: 401 })
      // new Headers acepta cualquier forma de init.headers (objeto, arreglo o
      // Headers); un spread de un Headers perdería sus valores.
      const pedir = (jwt: string | null) => {
        const headers = new Headers(init.headers)
        headers.set('Authorization', `Bearer ${jwt}`)
        return fetch(ruta, { ...init, headers })
      }
      const respuesta = await pedir(vigente.current)
      if (cerrada()) return new Response(null, { status: 401 })
      if (respuesta.status !== 401) return respuesta

      const nuevo = await renovarToken()
      if (cerrada()) return new Response(null, { status: 401 })
      if (nuevo) {
        vigente.current = nuevo
        const reintento = await pedir(nuevo)
        if (cerrada()) return new Response(null, { status: 401 })
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
        await cierreEnCurso.current
        const version = ++generacion.current
        setAviso(null)
        try {
          const nuevo = await pedirToken(correo, password)
          if (version !== generacion.current) return false
          if (nuevo) empezar(nuevo)
          return nuevo !== null
        } catch (error) {
          if (version === generacion.current && error instanceof LoginLimitado)
            setAviso(error.message)
          return false
        }
      },
      cerrarSesion,
      fetchConSesion,
    }),
    [token, restaurando, aviso, empezar, cerrarSesion, fetchConSesion],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}
