import { ROLES, type Rol } from '@cursus/shared'
import type { SessionUser } from './session/session'

// Única fuente de la navegación: el Sidebar, las rutas y el encabezado salen de
// aquí. AUTH-06 puede reemplazar `roles` por reglas de CASL sin tocar los
// componentes.

export type NavIconName = 'grid' | 'book'

export interface NavItem {
  to: string
  label: string
  icon: NavIconName
  roles: readonly Rol[]
  // Título y subtítulo del encabezado en esta ruta.
  title: (user: SessionUser) => string
  subtitle: (user: SessionUser) => string
}

const semestre = (user: SessionUser) => `Semestre ${user.periodo}`
const universidadYSemestre = (user: SessionUser) =>
  `${user.universidadNombre} · ${semestre(user)}`

export const NAV_ITEMS: readonly NavItem[] = [
  {
    to: '/',
    label: 'Dashboard',
    icon: 'grid',
    roles: ROLES,
    title: (user) =>
      user.rol === 'DIRECTOR'
        ? 'Visión del Directorio'
        : `Bienvenido/a, ${user.nombre}`,
    subtitle: universidadYSemestre,
  },
  {
    to: '/universidades',
    label: 'Mis Cursos',
    icon: 'book',
    roles: ['DIRECTOR'],
    title: () => 'Universidades',
    subtitle: universidadYSemestre,
  },
  {
    to: '/cursos',
    label: 'Mis Cursos',
    icon: 'book',
    roles: ['ADMINISTRATIVO'],
    title: () => 'Gestión académica',
    subtitle: (user) =>
      `${user.facultadNombre ?? user.universidadNombre} · ${semestre(user)}`,
  },
  {
    to: '/mis-cursos',
    label: 'Mis Cursos',
    icon: 'book',
    roles: ['PROFESOR', 'AYUDANTE', 'ALUMNO'],
    title: () => 'Mis Cursos',
    subtitle: universidadYSemestre,
  },
]

export function navItemsFor(rol: Rol): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(rol))
}

// Ítem de la ruta actual; también cubre subrutas (por ejemplo /mis-cursos/123).
export function navItemFor(pathname: string): NavItem | undefined {
  return NAV_ITEMS.find(
    (item) =>
      pathname === item.to ||
      (item.to !== '/' && pathname.startsWith(`${item.to}/`)),
  )
}
