import type { SeccionDashboard } from '@cursus/shared'
import { Link, useParams } from 'react-router'
import { Cargando } from '../components/Cargando'
import { ErrorEstado } from '../components/ErrorEstado'
import './Dashboard.css'
import { RUTA_MIS_SECCIONES, textoAlumnos } from './misSecciones'
import { useDatos } from './useDatos'

// Vista del curso que abre una tarjeta del dashboard (ESP-01). Muestra el
// curso y la sección con los mismos datos del dashboard, así que también
// funciona al recargar. ESP-04 la completa con horario, sala y equipo docente.
export function VistaSeccion() {
  const { id } = useParams()
  const [secciones, recargar] = useDatos<SeccionDashboard[]>(RUTA_MIS_SECCIONES)

  if (secciones === undefined) {
    return <Cargando />
  }
  if (secciones === null) {
    return (
      <ErrorEstado
        mensaje="No pudimos cargar la sección."
        onReintentar={recargar}
      />
    )
  }
  const seccion = secciones.find((s) => s.id === id)
  return (
    <section className="dashboard" aria-label="Vista del curso">
      {seccion ? (
        <>
          <span className="dashboard__codigo">{seccion.curso.codigo}</span>
          <h2 className="dashboard__titulo">{seccion.curso.nombre}</h2>
          <p className="dashboard__seccion">Sección {seccion.numero}</p>
          <p className="dashboard__texto">
            Profesor a cargo · {textoAlumnos(seccion.alumnos)}
          </p>
        </>
      ) : (
        <p className="dashboard__texto">
          Esta sección no está entre tus secciones del período activo.
        </p>
      )}
      <Link to="/">Volver al Dashboard</Link>
    </section>
  )
}
