import { Periodos } from './pages/Periodos'
import { Docentes } from './pages/Docentes'
import { Secciones } from './pages/AlumnosSeccion'
import type { Accion, AppAbility, Sujeto } from '@cursus/shared'
import {
  BookOpen,
  Building2,
  CalendarRange,
  ChartColumn,
  FileChartColumn,
  GraduationCap,
  Landmark,
  LayoutDashboard,
  Milestone,
  ScrollText,
  UserRound,
  Users,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'
import type { ComponentType } from 'react'
import { Cursos } from './pages/Cursos'
import { RutasIndicadores } from './pages/Indicadores'
import { RegistroAccesos } from './pages/RegistroAccesos'
import { ReporteFacultad } from './pages/ReporteFacultad'
import { Dashboard } from './pages/Dashboard'
import { MisCursos } from './pages/MisCursos'
import { Carreras } from './pages/Carreras'
import { Perfil } from './pages/Perfil'
import { RutasSuperadmin } from './pages/AdministrarUniversidad'
import type { SessionUser } from './session/session'

// Única fuente de la navegación: el Sidebar, las rutas, su guard y el
// encabezado salen de aquí. Agregar una sección es agregar un ítem.

// Permiso que exige el ítem, con las abilities de @cursus/shared: una acción
// sobre un sujeto (normalmente un sujeto de sección), o 'sesion' para
// cualquier usuario con sesión.
export type PermisoRuta = { accion: Accion; sujeto: Sujeto } | 'sesion'

export interface NavItem {
  to: string
  label: string | ((user: SessionUser) => string)
  // Ícono de lucide del menú lateral. Todo ítem lleva uno, también los que no
  // van en el menú (se usa en el breadcrumb y en pruebas).
  icon: LucideIcon
  permiso: PermisoRuta
  // Página de la ruta. Sin página, la ruta muestra solo el App Shell.
  page?: ComponentType
  // false para una ruta que no va en el menú lateral (por ejemplo, el perfil,
  // al que se llega desde el encabezado).
  enMenu?: boolean
  // Título de la ruta: el h1 del encabezado y su último paso en el breadcrumb.
  title: (user: SessionUser) => string
}

export const NAV_ITEMS: readonly NavItem[] = [
  {
    to: '/',
    label: 'Dashboard',
    icon: LayoutDashboard,
    permiso: 'sesion',
    page: Dashboard,
    title: (user) =>
      user.rol === 'DIRECTOR'
        ? 'Visión del Directorio'
        : `Bienvenido/a, ${user.nombre}`,
  },
  {
    // GES-23: el superadmin administra una universidad y sus facultades. Se
    // llega desde su Dashboard.
    to: '/superadmin',
    label: 'Administrar universidad',
    icon: Building2,
    enMenu: false,
    permiso: { accion: 'read', sujeto: 'PanelSuperadmin' },
    page: RutasSuperadmin,
    title: () => 'Administrar universidad',
  },
  {
    // MET-01: indicadores consolidados del Directorio.
    to: '/indicadores',
    label: 'Indicadores',
    icon: ChartColumn,
    permiso: { accion: 'read', sujeto: 'Metricas' },
    page: RutasIndicadores,
    title: () => 'Indicadores',
  },
  {
    // SEG-05: log de accesos y acciones sensibles, solo del Director.
    to: '/accesos',
    label: 'Registro de accesos',
    icon: ScrollText,
    permiso: { accion: 'read', sujeto: 'RegistroAccesos' },
    page: RegistroAccesos,
    title: () => 'Registro de accesos',
  },
  {
    // MET-08: reporte académico de la facultad del Administrativo.
    to: '/reporte-facultad',
    label: 'Reporte académico',
    icon: FileChartColumn,
    permiso: { accion: 'read', sujeto: 'ReporteMetricasFacultad' },
    page: ReporteFacultad,
    title: () => 'Reporte académico',
  },
  {
    to: '/universidades',
    label: 'Universidades',
    icon: Landmark,
    permiso: { accion: 'read', sujeto: 'PanelDirectorio' },
    title: () => 'Universidades',
  },
  {
    to: '/cursos',
    // El Director la ve en solo lectura junto a Universidades.
    label: (user) =>
      user.rol === 'DIRECTOR' ? 'Gestión académica' : 'Mis Cursos',
    icon: GraduationCap,
    permiso: { accion: 'read', sujeto: 'GestionAcademica' },
    page: Cursos,
    title: () => 'Gestión académica',
  },
  {
    to: '/carreras',
    label: 'Carreras',
    icon: Milestone,
    // GES-01 gestiona carreras de facultad; solo el administrativo las crea.
    permiso: { accion: 'create', sujeto: 'Carrera' },
    page: Carreras,
    title: () => 'Carreras',
  },
  {
    to: '/periodos',
    label: 'Períodos',
    icon: CalendarRange,
    permiso: { accion: 'create', sujeto: 'Periodo' },
    page: Periodos,
    title: () => 'Períodos académicos',
  },
  {
    // GES-21: el administrativo crea cuentas de profesores y ayudantes.
    to: '/docentes',
    label: 'Profesores y ayudantes',
    icon: UsersRound,
    permiso: { accion: 'create', sujeto: 'Usuario' },
    page: Docentes,
    title: () => 'Profesores y ayudantes',
  },
  {
    // Alumnos de una sección (GES-18), desde el detalle del curso.
    to: '/secciones',
    label: 'Secciones',
    icon: Users,
    enMenu: false,
    permiso: { accion: 'read', sujeto: 'Inscripcion' },
    page: Secciones,
    title: () => 'Gestión académica',
  },
  {
    to: '/mis-cursos',
    label: 'Mis Cursos',
    icon: BookOpen,
    permiso: { accion: 'read', sujeto: 'MisCursos' },
    page: MisCursos,
    title: () => 'Mis Cursos',
  },
  {
    // PER-01: se llega desde el nombre del encabezado, no desde el menú.
    to: '/perfil',
    label: 'Mi perfil',
    icon: UserRound,
    permiso: 'sesion',
    page: Perfil,
    enMenu: false,
    title: () => 'Mi perfil',
  },
]

export function puedeVer(item: NavItem, ability: AppAbility): boolean {
  return (
    item.permiso === 'sesion' ||
    ability.can(item.permiso.accion, item.permiso.sujeto)
  )
}

// Ítems del menú lateral: los que el rol puede ver, sin los que no van en el
// menú.
export function navItemsFor(ability: AppAbility): NavItem[] {
  return NAV_ITEMS.filter(
    (item) => item.enMenu !== false && puedeVer(item, ability),
  )
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
