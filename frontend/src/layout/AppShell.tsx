import { Outlet } from 'react-router'
import { DevRoleSelector } from '../session/DevRoleSelector'
import { Sidebar } from './Sidebar'
import './AppShell.css'

export function AppShell() {
  return (
    <div className="app-shell">
      <Sidebar id="sidebar" open={false} onNavigate={() => {}} />
      <main className="app-shell__content">
        <Outlet />
      </main>
      {import.meta.env.DEV && <DevRoleSelector />}
    </div>
  )
}
