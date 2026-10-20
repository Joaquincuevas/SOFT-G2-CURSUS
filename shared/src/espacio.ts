import type { Rol } from './index.js'

// ESP-06: datos básicos de una sección para su espacio. Solo los reciben sus
// integrantes (profesor, ayudantes y alumnos), el Administrativo de la
// facultad del curso y el Director. ESP-04 los amplía.
export interface SeccionEspacio {
  id: string
  numero: number
  curso: { id: string; codigo: string; nombre: string }
  periodo: { id: string; anio: number; semestre: number }
  // Con qué rol entra el usuario a esta sección.
  rol: Rol
}
