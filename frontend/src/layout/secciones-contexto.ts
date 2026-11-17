import type {
  SeccionAlumno,
  SeccionAyudante,
  SeccionDashboard,
} from '@cursus/shared'
import {
  createContext,
  useContext,
  useEffect,
  useEffectEvent,
  useState,
} from 'react'

// Secciones del período activo del usuario, tal como las entrega el
// Dashboard de su rol (profesor, ayudante o alumno). Se cargan una sola vez
// en el AppShell y las comparten el menú lateral, el Dashboard y Mis Cursos.
export type SeccionDelUsuario =
  SeccionDashboard | SeccionAyudante | SeccionAlumno

export interface ValorSecciones {
  // undefined mientras carga; null si falló; [] fuera de estos roles.
  secciones: SeccionDelUsuario[] | null | undefined
  recargar: () => void
}

export const SeccionesContext = createContext<ValorSecciones | null>(null)

// Las secciones del usuario. Con `refrescar`, la página que las muestra
// (Dashboard, Mis Cursos) las vuelve a pedir al montarse si ya estaban
// cargadas: los contadores (pendientes, anuncios nuevos) pueden haber
// cambiado mientras se navegaba. La primera carga no se repite.
export function useMisSecciones<T extends SeccionDelUsuario>(
  refrescar = false,
): readonly [T[] | null | undefined, () => void] {
  const valor = useContext(SeccionesContext)
  if (!valor)
    throw new Error('useMisSecciones debe usarse dentro de SeccionesProvider')
  const [yaEstaban] = useState(() => valor.secciones !== undefined)
  const pedir = useEffectEvent(() => valor.recargar())
  useEffect(() => {
    if (refrescar && yaEstaban) pedir()
  }, [refrescar, yaEstaban])
  return [valor.secciones as T[] | null | undefined, valor.recargar] as const
}
