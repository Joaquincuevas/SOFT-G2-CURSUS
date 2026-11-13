import { Link, Route, Routes } from 'react-router'
import { useSession } from '../session/session'
import { HistorialAlumno, RUTA_HISTORIAL } from './HistorialAlumno'
import { PendientesRevision } from './PendientesRevision'
import { VistaSeccion } from './VistaSeccion'

// Rutas bajo /mis-cursos. Las tarjetas del dashboard (ESP-01) abren la vista
// de una sección; ESP-04 la completa con horario, sala y equipo docente.
// NOT-10: el aviso de pendientes del dashboard abre su lista.
export function MisCursos() {
  const { user } = useSession()
  return (
    <Routes>
      <Route
        index
        element={
          user.rol === 'ALUMNO' ? (
            <section className="dashboard" aria-label="Mis cursos">
              <Link to={RUTA_HISTORIAL}>Historial de notas</Link>
            </section>
          ) : null
        }
      />
      <Route path="historial" element={<HistorialAlumno />} />
      <Route path="historial/:seccionId" element={<HistorialAlumno />} />
      <Route path="secciones/:id" element={<VistaSeccion />} />
      <Route path="pendientes-revision" element={<PendientesRevision />} />
    </Routes>
  )
}
