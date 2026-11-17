import { navItemFor } from '../navigation'
import type { SessionUser } from '../session/session'

// Un paso del breadcrumb del encabezado. Sin `to`, es la página actual. Una
// `etiqueta` null es un nombre que todavía no llega (se dibuja un esqueleto).
export interface Miga {
  etiqueta: string | null
  to?: string
}

const INICIO: Miga = { etiqueta: 'Inicio', to: '/' }
const CARGANDO: Miga = { etiqueta: null }
const SECCION = /^\/mis-cursos\/secciones\/[^/]+/
const HISTORIAL = /^\/mis-cursos\/historial(\/[^/]+)?$/
const PENDIENTES = /^\/mis-cursos\/pendientes-revision/
const CURSO_NUEVO = /^\/cursos\/nuevo$/
const CURSOS_ARCHIVADOS = /^\/cursos\/archivados(\/[^/]+)?$/
const SECCION_DE_GESTION = /^\/secciones\/[^/]+\/(integrantes|alumnos)$/

// Breadcrumb de una ruta: Inicio, los pasos que se saben por la ruta y los que
// solo la página conoce.
//
// - Los pasos fijos salen de NAV_ITEMS (título y ruta de la sección del menú)
//   y de las pocas subrutas con nombre propio de este archivo.
// - Los nombres que salen de datos (un curso, una universidad, una carrera) los
//   aporta la página con useMigas, y llegan aquí como `cola`. Mientras no
//   llegan, un paso con la etiqueta en null.
// - Si la cola repite el primer paso fijo (por ejemplo «Indicadores», con el
//   período en su enlace), lo reemplaza.
//
// El último paso es la página actual (el h1). La raíz (Dashboard) es un solo
// paso. El egresado solo ve su historial: no tiene Inicio, que lo devolvería a
// donde ya está.
export function migasDe(
  pathname: string,
  user: SessionUser,
  cola?: Miga[] | null,
): Miga[] {
  const item = navItemFor(pathname)
  // Sin ítem del menú la ruta no existe y se muestra la 404.
  if (!item) return [{ etiqueta: 'Página no encontrada' }]
  const titulo = item.title(user)
  if (user.egresado) return [{ etiqueta: titulo }]
  if (item.to === '/') return [{ etiqueta: titulo }]

  const enlace: Miga = { etiqueta: titulo, to: item.to }
  // Pasos que aporta la página, o un esqueleto mientras no llegan.
  const dinamicos = (previos: Miga[]) => {
    const resto = cola?.length ? cola : [CARGANDO]
    const sinRepetir =
      previos.length > 0 && resto[0]?.etiqueta === previos[0].etiqueta
        ? previos.slice(1)
        : previos
    return [INICIO, ...sinRepetir, ...resto]
  }

  if (SECCION.test(pathname)) {
    // Solo el alumno tiene la lista «Mis Cursos»; el profesor y el ayudante
    // llegan al curso desde las tarjetas del Dashboard.
    return dinamicos(user.rol === 'ALUMNO' ? [enlace] : [])
  }
  if (HISTORIAL.test(pathname)) {
    const historial = { etiqueta: 'Historial', to: '/mis-cursos/historial' }
    return pathname === '/mis-cursos/historial'
      ? [INICIO, enlace, { etiqueta: 'Historial' }]
      : dinamicos([enlace, historial])
  }
  if (PENDIENTES.test(pathname)) return [INICIO, { etiqueta: 'Pendientes' }]
  if (CURSO_NUEVO.test(pathname)) {
    return [INICIO, enlace, { etiqueta: 'Nuevo curso' }]
  }
  if (CURSOS_ARCHIVADOS.test(pathname)) {
    const archivados = {
      etiqueta: 'Cursos archivados',
      to: '/cursos/archivados',
    }
    return pathname === '/cursos/archivados'
      ? [INICIO, enlace, { etiqueta: 'Cursos archivados' }]
      : dinamicos([enlace, archivados])
  }
  if (SECCION_DE_GESTION.test(pathname)) {
    // Esta ruta no está en el menú: cuelga de la gestión de cursos.
    const cursos = navItemFor('/cursos')!
    return dinamicos([{ etiqueta: cursos.title(user), to: cursos.to }])
  }
  if (pathname === '/indicadores/comparar') {
    // La página aporta el enlace a Indicadores con el período elegido.
    return cola?.length
      ? dinamicos([enlace])
      : [INICIO, enlace, { etiqueta: 'Comparar universidades' }]
  }
  if (pathname === item.to || pathname === `${item.to}/`) {
    return [INICIO, { etiqueta: titulo }]
  }
  // Subruta con nombre que aporta la página (un curso, una universidad…).
  if (cola?.length) return dinamicos([enlace])
  if (DINAMICAS.some((patron) => patron.test(pathname))) {
    return dinamicos([enlace])
  }
  return [INICIO, { etiqueta: titulo }]
}

// Subrutas cuyo último paso es un nombre que llega con los datos de la página.
const DINAMICAS = [
  /^\/cursos\/[^/]+(\/editar)?$/,
  /^\/indicadores\/universidades\//,
  /^\/superadmin\/universidades\/[^/]+$/,
]
