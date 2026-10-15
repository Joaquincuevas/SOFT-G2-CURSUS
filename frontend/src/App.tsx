import { Route, Routes } from 'react-router'
import { AppShell } from './layout/AppShell'
import { NAV_ITEMS } from './navigation'
import { Placeholder } from './pages/Placeholder'

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        {NAV_ITEMS.map((item) => (
          <Route
            key={item.to}
            path={item.to}
            element={<Placeholder title={item.label} />}
          />
        ))}
      </Route>
    </Routes>
  )
}
