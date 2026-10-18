import { useContext } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { SessionContext } from '../session/session'
import { useAuth } from './auth'

// Ruta de layout: sin sesión redirige a /login y recuerda a dónde se quería ir.
// Con token, espera a que llegue el usuario de /api/auth/yo.
export function RequireAuth() {
  const { token } = useAuth()
  const sesion = useContext(SessionContext)
  const { pathname } = useLocation()

  if (!token) {
    return <Navigate to="/login" replace state={{ from: pathname }} />
  }
  if (!sesion) {
    return <p role="status">Cargando…</p>
  }
  return <Outlet />
}
