import { Route, Routes } from 'react-router'
import { RequireAuth } from './auth/RequireAuth'
import { RequirePermiso } from './auth/RequirePermiso'
import { RUTA_CAMBIO_OBLIGATORIO } from './auth/auth'
import { CambioObligatorio } from './pages/CambioObligatorio'
import { AppShell } from './layout/AppShell'
import { NAV_ITEMS } from './navigation'
import { Login } from './pages/Login'
import { NoEncontrada } from './pages/NoEncontrada'

// /login es pública; el resto exige sesión y el permiso de su ítem del menú.
// Las subrutas (por ejemplo /mis-cursos/123) heredan el permiso de su ítem: una
// ruta de otro rol vuelve al Dashboard. Una ruta que no existe muestra la 404.
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RequireAuth />}>
        {/* PER-03: sin el menú, porque no se puede ir a otra pantalla. */}
        <Route path={RUTA_CAMBIO_OBLIGATORIO} element={<CambioObligatorio />} />
        <Route element={<AppShell />}>
          {NAV_ITEMS.map((item) => (
            <Route
              key={item.to}
              path={item.to === '/' ? '/' : `${item.to}/*`}
              element={<RequirePermiso item={item} />}
            />
          ))}
          <Route path="*" element={<NoEncontrada />} />
        </Route>
      </Route>
    </Routes>
  )
}
