import { useContext } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { Cargando } from '../components/Cargando'
import {
  debeElegirFacultad,
  RUTA_ELEGIR_FACULTAD,
  SessionContext,
} from '../session/session'
import { RUTA_CAMBIO_OBLIGATORIO, useAuth } from './auth'

// Ruta de layout: sin sesión redirige a /login y recuerda a dónde se quería ir.
// Mientras se restaura la sesión con la cookie, o con token mientras llega el
// usuario de /api/auth/yo, muestra "Cargando…".
export function RequireAuth() {
  const { token, restaurando } = useAuth()
  const sesion = useContext(SessionContext)
  const { pathname } = useLocation()

  if (restaurando) {
    return <Cargando pantallaCompleta />
  }
  if (!token) {
    return <Navigate to="/login" replace state={{ from: pathname }} />
  }
  if (!sesion) {
    return <Cargando pantallaCompleta />
  }
  // PER-03: con la contraseña provisoria solo se entra a la pantalla para
  // cambiarla (la API rechaza el resto), y sin ella esa pantalla no aplica.
  const provisoria = sesion.user.debeCambiarPassword
  if (provisoria !== (pathname === RUTA_CAMBIO_OBLIGATORIO)) {
    return <Navigate to={provisoria ? RUTA_CAMBIO_OBLIGATORIO : '/'} replace />
  }
  // MT-04: el superadmin elige universidad y facultad antes de trabajar. Su
  // perfil no depende de la facultad.
  if (
    debeElegirFacultad(sesion.user) &&
    pathname !== RUTA_ELEGIR_FACULTAD &&
    pathname !== '/perfil'
  ) {
    return <Navigate to={RUTA_ELEGIR_FACULTAD} replace />
  }
  return <Outlet />
}
