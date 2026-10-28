import type { SeccionDashboard } from '@cursus/shared'
import { Link } from 'react-router'
import { Cargando } from '../components/Cargando'
import { ErrorEstado } from '../components/ErrorEstado'
import { useSession } from '../session/session'
import './Dashboard.css'
import {
  RUTA_MIS_SECCIONES,
  rutaSeccion,
  textoAlumnos,
  textoBloque,
} from './misSecciones'
import { PanelSuperadmin } from './PanelSuperadmin'
import { SeccionesAyudante } from './SeccionesAyudante'
import { SeccionesAlumno } from './SeccionesAlumno'
import { useDatos } from './useDatos'

// Dashboard de cada rol. El título del Figma ("Visión del Directorio" o
// "Bienvenido/a, <nombre>") lo muestra el Header. El profesor (ESP-01) y el
// ayudante (ESP-02) y el alumno (ESP-03) ven sus secciones del período activo.
// El superadmin (MT-04) ve las universidades y elige dónde trabajar.
export function Dashboard() {
  const { user } = useSession()
  return (
    <section aria-label="Dashboard" className="dashboard">
      {user.rol === 'PROFESOR' && <SeccionesProfesor />}
      {user.rol === 'AYUDANTE' && <SeccionesAyudante />}
      {user.rol === 'ALUMNO' && <SeccionesAlumno key={user.id} />}
      {user.rol === 'SUPERADMIN' && <PanelSuperadmin />}
    </section>
  )
}

function SeccionesProfesor() {
  const [secciones, recargar] = useDatos<SeccionDashboard[]>(RUTA_MIS_SECCIONES)

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
          No tienes secciones a tu cargo en el período activo.
        </p>
      ) : (
        <ul className="dashboard__tarjetas">
          {secciones.map((seccion) => (
            <li key={seccion.id}>
              <TarjetaSeccion seccion={seccion} />
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function TarjetaSeccion({ seccion }: { seccion: SeccionDashboard }) {
  const { curso, numero, horario, alumnos } = seccion
  return (
    <Link className="dashboard__tarjeta" to={rutaSeccion(seccion.id)}>
      <span className="dashboard__codigo">{curso.codigo}</span>
      <h3 className="dashboard__curso">{curso.nombre}</h3>
      <p className="dashboard__seccion">Sección {numero}</p>
      {horario.length === 0 ? (
        <p className="dashboard__horario">Sin horario asignado</p>
      ) : (
        <ul className="dashboard__horario" aria-label="Horario">
          {horario.map((bloque) => (
            <li key={`${bloque.dia}-${bloque.inicio}`}>
              {textoBloque(bloque)}
            </li>
          ))}
        </ul>
      )}
      <p className="dashboard__alumnos">{textoAlumnos(alumnos)}</p>
    </Link>
  )
}
