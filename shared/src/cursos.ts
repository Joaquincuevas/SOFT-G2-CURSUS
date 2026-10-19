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

// Query opcional de GET /api/cursos (GES-04): se pueden combinar.
export interface FiltroCursos {
  carreraId?: string
  periodoId?: string
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

// Sección dentro del detalle de un curso (GES-08). Lo que todavía no se puede
// asignar llega vacío: horario (GES-10), profesor y ayudantes (GES-12/13) y
// alumnos (GES-15). El frontend lo muestra como "Sin asignar".
export interface SeccionDetalle {
  id: string
  numero: number
  horario: string | null
  profesor: string | null
  ayudantes: string[]
  alumnos: number
}

// Respuesta de GET /api/cursos/:id (GES-08).
export interface CursoDetalle {
  id: string
  codigo: string
  nombre: string
  carreraNombre: string
  periodo: PeriodoResumen
  // Solo para el Director, que ve los cursos de todas las universidades.
  universidadNombre?: string
  // Ordenadas por número, sin las archivadas.
  secciones: SeccionDetalle[]
}

// Opciones de GET /api/periodos; GET /api/carreras usa el tipo Carrera.
export interface OpcionPeriodo extends PeriodoResumen {
  activo: boolean
}
