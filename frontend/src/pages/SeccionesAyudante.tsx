import type { SeccionAyudante } from '@cursus/shared'
import { nombresProfesores, textoProfesores } from './misSecciones'
import { TarjetasDocentes } from './TarjetasDocentes'
import { useDatos } from './useDatos'

export const RUTA_SECCIONES_AYUDANTE = '/api/dashboard/secciones-ayudante'

export function SeccionesAyudante() {
  const [secciones, recargar] = useDatos<SeccionAyudante[]>(
    RUTA_SECCIONES_AYUDANTE,
  )
  return (
    <TarjetasDocentes
      secciones={secciones}
      recargar={recargar}
      mensajeVacio="No eres ayudante de ninguna sección en el período activo."
      resumen={(seccion) => (
        <p className="m-0 break-words">
          {textoProfesores(nombresProfesores(seccion))}
        </p>
      )}
    />
  )
}
