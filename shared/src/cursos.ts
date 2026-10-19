// DTOs de gestión académica.

export interface PeriodoResumen {
  id: string
  anio: number
  semestre: number
}

// Cuerpo de POST /api/cursos (GES-05).
export interface CrearCurso {
  codigo: string
  nombre: string
  carreraId: string
  periodoId: string
}

// Respuesta de POST /api/cursos.
export interface CursoCreado {
  id: string
  codigo: string
  nombre: string
  carreraNombre: string
  periodo: PeriodoResumen
}

// Fila de GET /api/cursos (GES-03).
export interface CursoListado {
  id: string
  codigo: string
  nombre: string
  carreraNombre: string
  periodo: PeriodoResumen
  // Siempre 0 hasta que exista la tabla de secciones (GES-09).
  secciones: number
  // Solo para el Director, que ve los cursos de todas las universidades.
  universidadNombre?: string
}

// Opciones de GET /api/periodos; GET /api/carreras usa el tipo Carrera.
export interface OpcionPeriodo extends PeriodoResumen {
  activo: boolean
}
