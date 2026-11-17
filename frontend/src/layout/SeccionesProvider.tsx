import {
  useContext,
  useEffect,
  useEffectEvent,
  useMemo,
  type ReactNode,
} from 'react'
import { EVENTO_LECTURA_ANUNCIOS } from '../pages/anuncios'
import { RUTA_MIS_SECCIONES } from '../pages/misSecciones'
import { RUTA_SECCIONES_ALUMNO } from '../pages/SeccionesAlumno'
import { RUTA_SECCIONES_AYUDANTE } from '../pages/SeccionesAyudante'
import { useDatos } from '../pages/useDatos'
import { SessionContext } from '../session/session'
import { SeccionesContext, type SeccionDelUsuario } from './secciones-contexto'

const RUTA_POR_ROL: Record<string, string | undefined> = {
  PROFESOR: RUTA_MIS_SECCIONES,
  AYUDANTE: RUTA_SECCIONES_AYUDANTE,
  ALUMNO: RUTA_SECCIONES_ALUMNO,
}

export function SeccionesProvider({ children }: { children: ReactNode }) {
  const user = useContext(SessionContext)?.user
  // El egresado no tiene secciones vigentes; los demás roles no tienen esta
  // lista.
  const ruta = user && !user.egresado ? (RUTA_POR_ROL[user.rol] ?? null) : null
  const [datos, recargar] = useDatos<SeccionDelUsuario[]>(ruta)
  // Leer anuncios cambia el contador «anuncios nuevos» del alumno.
  const alLeer = useEffectEvent(() => recargar())
  useEffect(() => {
    const escuchar = () => alLeer()
    window.addEventListener(EVENTO_LECTURA_ANUNCIOS, escuchar)
    return () => window.removeEventListener(EVENTO_LECTURA_ANUNCIOS, escuchar)
  }, [])
  const secciones = ruta === null ? [] : datos
  const valor = useMemo(
    () => ({ secciones, recargar }),
    // recargar cambia de identidad en cada render; basta con las secciones.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [secciones],
  )
  return <SeccionesContext value={valor}>{children}</SeccionesContext>
}
