import { Link, useLocation } from 'react-router'
import { navItemFor } from '../navigation'
import { ROL_LABEL } from '../session/roles'
import { useSession } from '../session/session'
import './Header.css'

function iniciales(nombre: string) {
  return nombre
    .split(/\s+/)
    .slice(0, 2)
    .map((palabra) => palabra[0])
    .join('')
    .toUpperCase()
}

// Encabezado del Figma (nodo 97:626). Cerrar Sesión no va aquí: está en el
// Sidebar, como en el Figma. El bloque del usuario lleva a su perfil (PER-01);
// el Figma no tiene pantalla de perfil.
export function Header() {
  const { user } = useSession()
  const item = navItemFor(useLocation().pathname)

  return (
    <header className="header">
      <div className="header__context">
        {/* Sin ítem del menú, la ruta no existe y se muestra la 404. */}
        <h1 className="header__title">
          {item ? item.title(user) : 'Página no encontrada'}
        </h1>
        <p className="header__subtitle">{item?.subtitle(user)}</p>
      </div>
      <Link
        to="/perfil"
        className="header__user"
        aria-label={`Mi perfil: ${user.nombre}, ${ROL_LABEL[user.rol]}`}
      >
        <span className="header__avatar" aria-hidden="true">
          {iniciales(user.nombre)}
        </span>
        <div>
          <p className="header__name">{user.nombre}</p>
          <p className="header__role">{ROL_LABEL[user.rol]}</p>
        </div>
      </Link>
    </header>
  )
}
