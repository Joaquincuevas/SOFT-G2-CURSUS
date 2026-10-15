import { NavLink, useNavigate } from 'react-router'
import { navItemsFor } from '../navigation'
import { useSession } from '../session/session'
import { NavIcon, PowerIcon } from './icons'
import './Sidebar.css'

interface Props {
  id: string
  open: boolean
  onNavigate: () => void
}

export function Sidebar({ id, open, onNavigate }: Props) {
  const { user, logout } = useSession()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    onNavigate()
    navigate('/')
  }

  return (
    <aside id={id} className="sidebar" data-open={open}>
      <p className="sidebar__logo">CURSUS</p>
      <nav aria-label="Navegación principal">
        <ul className="sidebar__list">
          {navItemsFor(user.rol).map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === '/'}
                className="sidebar__item"
                onClick={onNavigate}
              >
                <NavIcon name={item.icon} />
                {item.label}
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
