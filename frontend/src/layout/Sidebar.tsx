import { NavLink } from 'react-router'
import { useAuth } from '../auth/auth'
import { etiquetaDe, navItemsFor } from '../navigation'
import { useSession } from '../session/session'
import { NavIcon, PowerIcon } from './icons'
import './Sidebar.css'

interface Props {
  id: string
  open: boolean
  onNavigate: () => void
}

export function Sidebar({ id, open, onNavigate }: Props) {
  const { user, ability } = useSession()
  const { cerrarSesion } = useAuth()

  function handleLogout() {
    onNavigate()
    cerrarSesion()
  }

  return (
    <aside id={id} className="sidebar" data-open={open}>
      <p className="sidebar__logo">CURSUS</p>
      <nav aria-label="Navegación principal">
        <ul className="sidebar__list">
          {navItemsFor(ability).map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === '/'}
                className="sidebar__item"
                onClick={onNavigate}
              >
                <NavIcon name={item.icon} />
                {etiquetaDe(item, user)}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <button
        type="button"
        className="sidebar__item sidebar__logout"
        onClick={handleLogout}
      >
        <PowerIcon />
        Cerrar Sesión
      </button>
    </aside>
  )
}
