import { useContext } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { Cargando } from '../components/Cargando'
import { SessionContext } from '../session/session'
import { useAuth } from './auth'

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
  return <Outlet />
}
