import { navItemFor } from '../navigation'
import type { SessionUser } from '../session/session'

// Un paso del breadcrumb del encabezado. Sin `to`, es la página actual.
export interface Miga {
  etiqueta: string
  to?: string
}

const INICIO: Miga = { etiqueta: 'Inicio', to: '/' }
const SECCION = /^\/mis-cursos\/secciones\/[^/]+/
const HISTORIAL = /^\/mis-cursos\/historial/
const PENDIENTES = /^\/mis-cursos\/pendientes-revision/

// Breadcrumb de una ruta. Sale de NAV_ITEMS (el título de la ruta es el último
// paso y el h1 de la página) y de las pocas subrutas con nombre propio. Una
// página con un nombre que solo ella conoce (la sección de un curso) lo aporta
// con useEtiquetaDeMiga, y llega aquí como `dinamica`.
//
// Sin `to`, el paso es la página actual. La raíz (Dashboard) es un solo paso y
// no lleva breadcrumb. El egresado solo ve su historial: no tiene Inicio, que lo
// devolvería a donde ya está. El último paso no repite el título que la página
// pone en su propio encabezado («Historial de notas», «Pendientes de revisión»).
export function migasDe(
  pathname: string,
  user: SessionUser,
  dinamica?: string | null,
): Miga[] {
  const item = navItemFor(pathname)
  // Sin ítem del menú la ruta no existe y se muestra la 404.
  if (!item) return [{ etiqueta: 'Página no encontrada' }]
  const titulo = item.title(user)
  if (user.egresado) return [{ etiqueta: titulo }]
  if (item.to === '/') return [{ etiqueta: titulo }]
  if (SECCION.test(pathname)) {
    // El curso de la sección cuelga del Dashboard, donde están sus tarjetas.
    return [INICIO, { etiqueta: dinamica ?? 'Sección' }]
  }
  if (HISTORIAL.test(pathname)) {
    return [
      INICIO,
      { etiqueta: titulo, to: '/mis-cursos' },
      { etiqueta: 'Historial' },
    ]
  }
  if (PENDIENTES.test(pathname)) {
    return [INICIO, { etiqueta: 'Pendientes' }]
  }
  return [INICIO, { etiqueta: titulo }]
}
