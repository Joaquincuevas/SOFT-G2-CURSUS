import { useSession } from '../session/session'
import { DashboardAdministrativo } from './DashboardAdministrativo'
import { DashboardDirector } from './DashboardDirector'
import { DashboardDocente } from './DashboardDocente'
import { PanelSuperadmin } from './PanelSuperadmin'
import { SeccionesAlumno } from './SeccionesAlumno'

// Dashboard de cada rol. El título del Figma ("Visión del Directorio" o
// "Bienvenido/a, <nombre>") lo muestra el Header. El profesor (ESP-01) y el
// ayudante (ESP-02) y el alumno (ESP-03) ven sus secciones del período activo.
// El Director (MET-01) ve el consolidado de las universidades. El superadmin
// (MT-04) ve las universidades y elige dónde trabajar.
export function Dashboard() {
  const { user } = useSession()
  if (user.rol === 'ALUMNO') {
    return (
      <section aria-label="Dashboard">
        <SeccionesAlumno key={user.id} />
      </section>
    )
  }
  if (user.rol === 'DIRECTOR') {
    return (
      <section aria-label="Dashboard">
        <DashboardDirector />
      </section>
    )
  }
  return (
    <section aria-label="Dashboard" className="grid gap-4">
      {user.rol === 'ADMINISTRATIVO' && <DashboardAdministrativo />}
      {(user.rol === 'PROFESOR' || user.rol === 'AYUDANTE') && (
        <DashboardDocente rol={user.rol} />
      )}
      {user.rol === 'SUPERADMIN' && <PanelSuperadmin />}
    </section>
  )
}
