import { useEffect, useState } from 'react'
import { Outlet } from 'react-router'
import { ContextoSuperadmin } from './ContextoSuperadmin'
import { Header } from './Header'
import { MenuIcon } from './icons'
import { Sidebar } from './Sidebar'
import './AppShell.css'

export function AppShell() {
  // Solo tiene efecto bajo 1024 px; en pantallas anchas el Sidebar es fijo.
  const [menuOpen, setMenuOpen] = useState(false)
  const closeMenu = () => setMenuOpen(false)

  useEffect(() => {
    if (!menuOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [menuOpen])

  return (
    <div className="app-shell">
      <button
        type="button"
        className="app-shell__menu-button"
        aria-label="Menú"
        aria-controls="sidebar"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <MenuIcon />
      </button>
      {menuOpen && (
        <div
          className="app-shell__backdrop"
          data-testid="menu-backdrop"
          onClick={closeMenu}
        />
      )}
      <Sidebar id="sidebar" open={menuOpen} onNavigate={closeMenu} />
      <main className="app-shell__main">
        <Header />
        <div className="app-shell__content">
          <ContextoSuperadmin />
          <Outlet />
        </div>
      </main>
    </div>
  )
}
