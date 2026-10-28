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

// Arma la sesión real cada vez que empieza una (login o restauración): pide
// /api/auth/yo y, si falla, cierra la sesión. Renovar el JWT no la recarga.
export function SessionProvider({ children }: { children: ReactNode }) {
  const { token, cerrarSesion, fetchConSesion } = useAuth()
  // Se guarda junto al token que la pidió, para no mostrar el usuario de un
  // token anterior.
  const [cargada, setCargada] = useState<{
    token: string
    user: SessionUser
  } | null>(null)
  const alFallar = useEffectEvent(() => cerrarSesion())
  const pedir = useEffectEvent(() => pedirUsuario(fetchConSesion))

  useEffect(() => {
    if (!token) return
    let vigente = true
    void pedir().then((user) => {
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
        ? {
            user: cargada.user,
            ability: definirAbilityPara(cargada.user),
            actualizarPeriodoActivo: (
              periodoActivo: SessionUser['periodoActivo'],
            ) =>
              setCargada((anterior) =>
                anterior?.token === token
                  ? { ...anterior, user: { ...anterior.user, periodoActivo } }
                  : anterior,
              ),
            actualizarNombre: (nombre: string) =>
              setCargada((anterior) =>
                anterior?.token === token
                  ? { ...anterior, user: { ...anterior.user, nombre } }
                  : anterior,
              ),
            reemplazarUsuario: (user: SessionUser) =>
              setCargada((anterior) =>
                anterior?.token === token ? { ...anterior, user } : anterior,
              ),
            marcarPasswordCambiada: () =>
              setCargada((anterior) =>
                anterior?.token === token
                  ? {
                      ...anterior,
                      user: { ...anterior.user, debeCambiarPassword: false },
                    }
                  : anterior,
              ),
          }
        : null,
    [cargada, token],
  )

  return <SessionContext value={value}>{children}</SessionContext>
}
