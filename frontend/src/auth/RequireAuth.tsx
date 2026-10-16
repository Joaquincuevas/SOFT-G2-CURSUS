import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from './auth'

// Ruta de layout: sin sesión redirige a /login y recuerda a dónde se quería ir.
export function RequireAuth() {
  const { token } = useAuth()
  const { pathname } = useLocation()

  if (!token) {
    return <Navigate to="/login" replace state={{ from: pathname }} />
  }
  return <Outlet />
}
