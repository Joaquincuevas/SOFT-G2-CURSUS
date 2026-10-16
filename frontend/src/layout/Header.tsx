import type { Rol } from '@cursus/shared'
import { useLocation } from 'react-router'
import { navItemFor } from '../navigation'
import { useSession } from '../session/session'
import './Header.css'

const ROL_LABEL: Record<Rol, string> = {
  DIRECTOR: 'Director',
  ADMINISTRATIVO: 'Administrativo',
  PROFESOR: 'Profesor',
  AYUDANTE: 'Ayudante',
  ALUMNO: 'Alumno',
}

function iniciales(nombre: string) {
  return nombre
    .split(/\s+/)
    .slice(0, 2)
    .map((palabra) => palabra[0])
    .join('')
    .toUpperCase()
}

// Encabezado del Figma (nodo 97:626). Cerrar Sesión no va aquí: está en el
// Sidebar, como en el Figma.
export function Header() {
  const { user } = useSession()
  const item = navItemFor(useLocation().pathname)

  return (
    <header className="header">
      <div className="header__context">
        <h1 className="header__title">{item?.title(user)}</h1>
        <p className="header__subtitle">{item?.subtitle(user)}</p>
      </div>
      <div className="header__user">
        <span className="header__avatar" aria-hidden="true">
          {iniciales(user.nombre)}
        </span>
        <div>
          <p className="header__name">{user.nombre}</p>
          <p className="header__role">{ROL_LABEL[user.rol]}</p>
        </div>
      </div>
    </header>
  )
}
