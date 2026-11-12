import { Route, Routes } from 'react-router'
import { PendientesRevision } from './PendientesRevision'
import { VistaSeccion } from './VistaSeccion'

// Rutas bajo /mis-cursos. Las tarjetas del dashboard (ESP-01) abren la vista
// de una sección; ESP-04 la completa con horario, sala y equipo docente.
// NOT-10: el aviso de pendientes del dashboard abre su lista.
export function MisCursos() {
  return (
    <Routes>
      <Route index element={null} />
      <Route path="secciones/:id" element={<VistaSeccion />} />
      <Route path="pendientes-revision" element={<PendientesRevision />} />
    </Routes>
  )
}
