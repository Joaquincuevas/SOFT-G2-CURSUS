import type { AlumnoAgregado } from './cursos.js'

export const MAX_FILAS_ALUMNOS_CSV = 100
export const MAX_BYTES_ALUMNOS_CSV = 48 * 1024
export interface CargarAlumnosCsv {
  csv: string
}
export type FilaCargaAlumnos =
  | ({ fila: number; correo: string; estado: 'cargado' } & AlumnoAgregado)
  | { fila: number; correo: string; estado: 'error'; mensaje: string }
export interface ResultadoCargaAlumnos {
  total: number
  cargados: number
  errores: number
  filas: FilaCargaAlumnos[]
}
