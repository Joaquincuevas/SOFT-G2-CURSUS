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

// Opciones de las listas del formulario (GET /api/carreras y /api/periodos).
export interface OpcionCarrera {
  id: string
  nombre: string
}

export interface OpcionPeriodo extends PeriodoResumen {
  activo: boolean
}
