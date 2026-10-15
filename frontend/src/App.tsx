import { Route, Routes } from 'react-router'
import { AppShell } from './layout/AppShell'
import { NAV_ITEMS } from './navigation'

// Las páginas aún no existen: cada ruta muestra solo el App Shell, con el
// título de la ruta en el encabezado.
export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        {NAV_ITEMS.map((item) => (
          <Route key={item.to} path={item.to} />
        ))}
      </Route>
    </Routes>
  )
}
