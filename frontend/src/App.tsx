import { Route, Routes } from 'react-router'
import { RequireAuth } from './auth/RequireAuth'
import { AppShell } from './layout/AppShell'
import { NAV_ITEMS } from './navigation'
import { Login } from './pages/Login'

// /login es pública; el resto exige sesión. Las páginas aún no existen: cada
// ruta muestra solo el App Shell, con el título de la ruta en el encabezado.
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          {NAV_ITEMS.map((item) => (
            <Route key={item.to} path={item.to} element={null} />
          ))}
        </Route>
      </Route>
    </Routes>
  )
}
