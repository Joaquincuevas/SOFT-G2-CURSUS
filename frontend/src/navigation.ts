import type { Accion, AppAbility, Sujeto } from '@cursus/shared'
import type { ComponentType } from 'react'
import { Dashboard } from './pages/Dashboard'
import type { SessionUser } from './session/session'

// Única fuente de la navegación: el Sidebar, las rutas, su guard y el
// encabezado salen de aquí. Agregar una sección es agregar un ítem.

export type NavIconName = 'grid' | 'book'

// Permiso que exige el ítem, con las abilities de @cursus/shared: una acción
// sobre un sujeto (normalmente un sujeto de sección), o 'sesion' para
// cualquier usuario con sesión.
export type PermisoRuta = { accion: Accion; sujeto: Sujeto } | 'sesion'

export interface NavItem {
  to: string
  label: string | ((user: SessionUser) => string)
  icon: NavIconName
  permiso: PermisoRuta
  // Página de la ruta. Sin página, la ruta muestra solo el App Shell.
  page?: ComponentType
  // Título y subtítulo del encabezado en esta ruta.
  title: (user: SessionUser) => string
  subtitle: (user: SessionUser) => string
}

const semestre = ({ periodoActivo }: SessionUser) =>
  periodoActivo && `Semestre ${periodoActivo.anio}-${periodoActivo.semestre}`
const conSemestre = (lugar: string, user: SessionUser) =>
  [lugar, semestre(user)].filter(Boolean).join(' · ')
const universidadYSemestre = (user: SessionUser) =>
  conSemestre(user.universidadNombre, user)

export const NAV_ITEMS: readonly NavItem[] = [
  {
    to: '/',
    label: 'Dashboard',
    icon: 'grid',
    permiso: 'sesion',
    page: Dashboard,
    title: (user) =>
      user.rol === 'DIRECTOR'
        ? 'Visión del Directorio'
        : `Bienvenido/a, ${user.nombre}`,
    subtitle: universidadYSemestre,
  },
  {
    to: '/universidades',
    label: 'Universidades',
    icon: 'book',
    permiso: { accion: 'read', sujeto: 'PanelDirectorio' },
    title: () => 'Universidades',
    subtitle: universidadYSemestre,
  },
  {
    to: '/cursos',
    // El Director la ve en solo lectura junto a Universidades.
    label: (user) =>
      user.rol === 'DIRECTOR' ? 'Gestión académica' : 'Mis Cursos',
    icon: 'book',
    permiso: { accion: 'read', sujeto: 'GestionAcademica' },
    title: () => 'Gestión académica',
    subtitle: (user) =>
      conSemestre(user.facultadNombre ?? user.universidadNombre, user),
  },
  {
    to: '/mis-cursos',
    label: 'Mis Cursos',
    icon: 'book',
    permiso: { accion: 'read', sujeto: 'MisCursos' },
    title: () => 'Mis Cursos',
    subtitle: universidadYSemestre,
  },
]

export function puedeVer(item: NavItem, ability: AppAbility): boolean {
  return (
    item.permiso === 'sesion' ||
    ability.can(item.permiso.accion, item.permiso.sujeto)
  )
}

export function navItemsFor(ability: AppAbility): NavItem[] {
  return NAV_ITEMS.filter((item) => puedeVer(item, ability))
}

export function etiquetaDe(item: NavItem, user: SessionUser): string {
  return typeof item.label === 'string' ? item.label : item.label(user)
}

// Ítem de la ruta actual; también cubre subrutas (por ejemplo /mis-cursos/123).
export function navItemFor(pathname: string): NavItem | undefined {
  return NAV_ITEMS.find(
    (item) =>
      pathname === item.to ||
      (item.to !== '/' && pathname.startsWith(`${item.to}/`)),
  )
}
