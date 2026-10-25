import type { SeccionAyudante } from '@cursus/shared'
import { Link } from 'react-router'
import { Cargando } from '../components/Cargando'
import { ErrorEstado } from '../components/ErrorEstado'
import './Dashboard.css'
import { rutaSeccion } from './misSecciones'
import { useDatos } from './useDatos'

// ESP-02: secciones donde el usuario es ayudante en el período activo.
export const RUTA_SECCIONES_AYUDANTE = '/api/dashboard/secciones-ayudante'

export function SeccionesAyudante() {
  const [secciones, recargar] = useDatos<SeccionAyudante[]>(
    RUTA_SECCIONES_AYUDANTE,
  )

  if (secciones === undefined) {
    return <Cargando texto="Cargando tus secciones…" />
  }
  if (secciones === null) {
    return (
      <ErrorEstado
        mensaje="No pudimos cargar tus secciones."
        onReintentar={recargar}
      />
    )
  }
  return (
    <>
      <h2 className="dashboard__titulo">Mis secciones del período</h2>
      {secciones.length === 0 ? (
        <p className="dashboard__texto">
          No eres ayudante de ninguna sección en el período activo.
        </p>
      ) : (
        <ul className="dashboard__tarjetas">
          {secciones.map((seccion) => (
            <li key={seccion.id}>
              <TarjetaAyudante seccion={seccion} />
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

// Misma tarjeta que la del profesor (ESP-01), con el profesor a cargo en vez
// del horario y los alumnos.
function TarjetaAyudante({ seccion }: { seccion: SeccionAyudante }) {
  const { curso, numero, profesor } = seccion
  return (
    <Link className="dashboard__tarjeta" to={rutaSeccion(seccion.id)}>
      <span className="dashboard__codigo">{curso.codigo}</span>
      <h3 className="dashboard__curso">{curso.nombre}</h3>
      <p className="dashboard__seccion">Sección {numero}</p>
      <p className="dashboard__texto">
        {profesor
          ? `Profesor a cargo: ${profesor.nombre}`
          : 'Sin profesor asignado'}
      </p>
    </Link>
  )
}
