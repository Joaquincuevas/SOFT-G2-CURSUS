import {
  CalendarCheck,
  ClipboardList,
  FolderOpen,
  House,
  Inbox,
  Megaphone,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { rutaSeccion } from './misSecciones'

// Secciones del espacio de un curso. Es la única lista: la vista de la sección
// decide qué mostrar con ella y el menú lateral (Sidebar) arma con ella los
// ítems del curso. Cada una se abre con ?vista=<id> (Home es la de por
// defecto). Hoy las ven igual el profesor, el ayudante y el alumno.
export type VistaId =
  | 'home'
  | 'anuncios'
  | 'material'
  | 'entregas'
  | 'notas'
  | 'asistencia'
  | 'integrantes'

export interface VistaCurso {
  id: VistaId
  etiqueta: string
  icono: LucideIcon
  // Qué hay ahí, para los accesos del Home.
  detalle?: string
}

export const VISTAS_CURSO: readonly VistaCurso[] = [
  { id: 'home', etiqueta: 'Home', icono: House },
  {
    id: 'anuncios',
    etiqueta: 'Anuncios',
    icono: Megaphone,
    detalle: 'Avisos de la sección',
  },
  {
    id: 'material',
    etiqueta: 'Material',
    icono: FolderOpen,
    detalle: 'Archivos y documentos',
  },
  {
    id: 'entregas',
    etiqueta: 'Entregas',
    icono: Inbox,
    detalle: 'Trabajos e informes',
  },
  {
    id: 'notas',
    etiqueta: 'Notas',
    icono: ClipboardList,
    detalle: 'Evaluaciones y calificaciones',
  },
  {
    id: 'asistencia',
    etiqueta: 'Asistencia',
    icono: CalendarCheck,
    detalle: 'Clases y asistencia',
  },
  { id: 'integrantes', etiqueta: 'Integrantes', icono: Users },
]

export const esVista = (valor: string | null): valor is VistaId =>
  VISTAS_CURSO.some((vista) => vista.id === valor)

// Vista elegida en la URL (?vista=), o Home.
export const vistaDe = (parametro: string | null): VistaId =>
  esVista(parametro) ? parametro : 'home'

export const rutaVista = (seccionId: string, vista: VistaId) =>
  rutaSeccion(seccionId, vista === 'home' ? undefined : vista)

// Nombre de una vista para un rol. «Integrantes» muestra el equipo docente y,
// solo al profesor, también la nómina de alumnos: el alumno y el ayudante ven
// únicamente a los docentes, así que para ellos es «Académicos».
export const etiquetaDeVista = (vista: VistaId, rol?: string) =>
  vista === 'integrantes' && rol !== 'PROFESOR'
    ? 'Académicos'
    : (VISTAS_CURSO.find((v) => v.id === vista)?.etiqueta ?? vista)
