import { definirAbilityPara } from '@cursus/shared'
import {
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from '../auth/auth'
import { pedirUsuario, SessionContext, type SessionUser } from './session'

// Arma la sesión real cada vez que cambia el token: pide /api/auth/yo y, si
// falla, cierra la sesión.
export function SessionProvider({ children }: { children: ReactNode }) {
  const { token, cerrarSesion } = useAuth()
  // Se guarda junto al token que la pidió, para no mostrar el usuario de un
  // token anterior.
  const [cargada, setCargada] = useState<{
    token: string
    user: SessionUser
  } | null>(null)
  const alFallar = useEffectEvent(cerrarSesion)

  useEffect(() => {
    if (!token) return
    let vigente = true
    void pedirUsuario(token).then((user) => {
      if (!vigente) return
      if (user) setCargada({ token, user })
      else alFallar()
    })
    return () => {
      vigente = false
    }
  }, [token])

  const value = useMemo(
    () =>
      cargada && cargada.token === token
        ? { user: cargada.user, ability: definirAbilityPara(cargada.user) }
        : null,
    [cargada, token],
  )

  return <SessionContext value={value}>{children}</SessionContext>
}
