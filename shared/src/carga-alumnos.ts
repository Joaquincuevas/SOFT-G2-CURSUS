import type { AlumnoAgregado } from './cursos.js'

export const MAX_FILAS_ALUMNOS_CSV = 100
export const MAX_BYTES_ALUMNOS_CSV = 48 * 1024
export interface CargarAlumnosCsv {
  csv: string
}
// Motivo estable de una fila con error (GES-17). El frontend y el CSV de
// errores muestran MENSAJES_MOTIVO_CSV; `mensaje` trae el texto del backend.
export type MotivoErrorCsv =
  | 'formato'
  | 'correo_invalido'
  | 'nombre_invalido'
  | 'dominio_distinto'
  | 'duplicado_en_archivo'
  | 'ya_inscrito'
  | 'rol_distinto'
  | 'falta_nombre'
  | 'cuenta_archivada'
  | 'error_interno'

export const MENSAJES_MOTIVO_CSV: Record<MotivoErrorCsv, string> = {
  formato: 'La fila debe tener dos columnas: correo,nombre',
  correo_invalido: 'Correo inválido',
  nombre_invalido: 'Nombre inválido o demasiado largo',
  dominio_distinto: 'El correo no es del dominio de la universidad',
  duplicado_en_archivo: 'Correo repetido en el archivo',
  ya_inscrito: 'Ya está inscrito en esta sección',
  rol_distinto: 'El correo pertenece a una cuenta que no es de alumno',
  falta_nombre: 'Falta el nombre para crear la cuenta',
  cuenta_archivada: 'La cuenta del alumno está archivada',
  error_interno: 'No se pudo cargar esta fila. Intenta nuevamente.',
}

export type FilaCargaAlumnos =
  | ({ fila: number; correo: string; estado: 'cargado' } & AlumnoAgregado)
  | {
      fila: number
      correo: string
      // El nombre tal como venía en la fila, para rearmar el CSV.
      nombre: string
      estado: 'error'
      motivo: MotivoErrorCsv
      mensaje: string
    }
export interface ResultadoCargaAlumnos {
  total: number
  cargados: number
  errores: number
  filas: FilaCargaAlumnos[]
}
