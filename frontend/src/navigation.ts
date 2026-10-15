import { ROLES, type Rol } from '@cursus/shared'

// Única fuente de la navegación: el Sidebar y las rutas salen de aquí.
// AUTH-06 puede reemplazar `roles` por reglas de CASL sin tocar los componentes.

export type NavIconName = 'grid' | 'book'

export interface NavItem {
  to: string
  label: string
  icon: NavIconName
  roles: readonly Rol[]
}

export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: 'Dashboard', icon: 'grid', roles: ROLES },
  {
    to: '/universidades',
    label: 'Mis Cursos',
    icon: 'book',
    roles: ['DIRECTOR'],
  },
  {
    to: '/cursos',
    label: 'Mis Cursos',
    icon: 'book',
    roles: ['ADMINISTRATIVO'],
  },
  {
    to: '/mis-cursos',
    label: 'Mis Cursos',
    icon: 'book',
    roles: ['PROFESOR', 'AYUDANTE', 'ALUMNO'],
  },
]

export function navItemsFor(rol: Rol): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(rol))
}
