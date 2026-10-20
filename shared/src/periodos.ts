import type { OpcionPeriodo } from './cursos.js'

// Fechas de calendario YYYY-MM-DD, sin conversión de zona horaria.
export interface Periodo extends OpcionPeriodo {
  fechaInicio: string
  fechaTermino: string
}

export interface CrearPeriodo {
  anio: number
  semestre: number
  fechaInicio: string
  fechaTermino: string
  activo: boolean
}
