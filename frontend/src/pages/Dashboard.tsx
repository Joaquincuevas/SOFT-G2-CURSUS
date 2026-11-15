import type { SeccionDashboard } from '@cursus/shared'
import { Link } from 'react-router'
import { ClipboardCheck } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useSession } from '../session/session'
import {
  RUTA_MIS_SECCIONES,
  RUTA_PAGINA_PENDIENTES,
  textoAlumnos,
  textoBloque,
  textoPendientes,
} from './misSecciones'
import { DashboardAdministrativo } from './DashboardAdministrativo'
import { DashboardDirector } from './DashboardDirector'
import { PanelSuperadmin } from './PanelSuperadmin'
import { SeccionesAyudante } from './SeccionesAyudante'
import { SeccionesAlumno } from './SeccionesAlumno'
import { TarjetasDocentes } from './TarjetasDocentes'
import { useDatos } from './useDatos'

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
      {user.rol === 'PROFESOR' && <SeccionesProfesor />}
      {user.rol === 'AYUDANTE' && <SeccionesAyudante />}
      {user.rol === 'SUPERADMIN' && <PanelSuperadmin />}
    </section>
  )
}

function SeccionesProfesor() {
  const [secciones, recargar] = useDatos<SeccionDashboard[]>(RUTA_MIS_SECCIONES)

  const pendientes =
    secciones?.reduce((n, s) => n + s.pendientesRevision, 0) ?? 0
  return (
    <TarjetasDocentes
      secciones={secciones}
      recargar={recargar}
      mensajeVacio="No tienes secciones a tu cargo en el período activo."
      pendientes={
        secciones?.length ? (
          <Alert
            role="region"
            aria-label="Por revisar"
            className="min-w-0 bg-card"
          >
            <ClipboardCheck aria-hidden="true" />
            <AlertTitle>Por revisar</AlertTitle>
            <AlertDescription>
              {pendientes === 0 ? (
                <p className="m-0">
                  No tienes evaluaciones pendientes de revisión.
                </p>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <p className="m-0">{textoPendientes(pendientes)}.</p>
                  <Button asChild variant="outline" size="sm">
                    <Link to={RUTA_PAGINA_PENDIENTES}>Ver pendientes</Link>
                  </Button>
                </div>
              )}
            </AlertDescription>
          </Alert>
        ) : null
      }
      resumen={({ horario, alumnos, pendientesRevision }) => (
        <>
          {horario.length === 0 ? (
            <p className="m-0">Sin horario asignado</p>
          ) : (
            <ul className="m-0 grid list-none gap-1 p-0" aria-label="Horario">
              {horario.map((bloque) => (
                <li key={`${bloque.dia}-${bloque.inicio}`}>
                  {textoBloque(bloque)}
                </li>
              ))}
            </ul>
          )}
          <p className="m-0 font-medium">{textoAlumnos(alumnos)}</p>
          {pendientesRevision > 0 && (
            <Badge variant="secondary" className="max-w-full whitespace-normal">
              {textoPendientes(pendientesRevision)}
            </Badge>
          )}
        </>
      )}
    />
  )
}
