import { Route, Routes } from 'react-router'
import { VistaSeccion } from './VistaSeccion'

// Rutas bajo /mis-cursos. Las tarjetas del dashboard (ESP-01) abren la vista
// de una sección; ESP-04 la completa con horario, sala y equipo docente.
export function MisCursos() {
  return (
    <Routes>
      <Route index element={null} />
      <Route path="secciones/:id" element={<VistaSeccion />} />
    </Routes>
  )
}
