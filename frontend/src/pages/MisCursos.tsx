import { Navigate, Route, Routes } from 'react-router'
import { useSession } from '../session/session'
import { HistorialAlumno } from './HistorialAlumno'
import { ListaMisCursos } from './ListaMisCursos'
import { PendientesRevision } from './PendientesRevision'
import { VistaSeccion } from './VistaSeccion'

// Rutas bajo /mis-cursos. Solo el alumno tiene la lista de sus cursos; el
// profesor y el ayudante ven los suyos en el Dashboard, así que la ruta index
// los lleva allí. Las tarjetas del dashboard (ESP-01) abren la vista de una
// sección; ESP-04 la completa con horario, sala y equipo docente. NOT-10: el
// aviso de pendientes del dashboard abre su lista.
export function MisCursos() {
  const { user } = useSession()
  return (
    <Routes>
      <Route
        index
        element={
          user.rol === 'ALUMNO' ? (
            <ListaMisCursos key={user.id} />
          ) : (
            <Navigate to="/" replace />
          )
        }
      />
      <Route path="historial" element={<HistorialAlumno />} />
      <Route path="historial/:seccionId" element={<HistorialAlumno />} />
      <Route path="secciones/:id" element={<VistaSeccion />} />
      <Route path="pendientes-revision" element={<PendientesRevision />} />
    </Routes>
  )
}
