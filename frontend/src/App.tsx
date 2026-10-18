import { Navigate, Route, Routes } from 'react-router'
import { RequireAuth } from './auth/RequireAuth'
import { RequirePermiso } from './auth/RequirePermiso'
import { AppShell } from './layout/AppShell'
import { NAV_ITEMS } from './navigation'
import { Login } from './pages/Login'

// /login es pública; el resto exige sesión y el permiso de su ítem del menú.
// Las subrutas (por ejemplo /mis-cursos/123) heredan el permiso de su ítem y
// cualquier otra ruta vuelve al Dashboard.
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          {NAV_ITEMS.map((item) => (
            <Route
              key={item.to}
              path={item.to === '/' ? '/' : `${item.to}/*`}
              element={<RequirePermiso item={item} />}
            />
          ))}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  )
}
