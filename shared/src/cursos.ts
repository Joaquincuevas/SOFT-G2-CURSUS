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

// Snapshot usado por la edición y su historial (GES-07).
export interface CursoEditable extends CrearCurso {
  id: string
  carreraNombre: string
  periodo: PeriodoResumen
}

export interface CambioCurso {
  id: string
  fecha: string
  responsable: { id: string; nombre: string }
  anterior: CursoEditable
  nuevo: CursoEditable
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
// asignar llega vacío: horario (GES-10) y profesor (GES-12).
// Ayudantes (GES-13) y alumnos (GES-15) consideran las asociaciones activas.
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
  universidadId?: string
  universidadNombre?: string
  // Ordenadas por número, sin las archivadas.
  secciones: SeccionDetalle[]
}

// Opciones de GET /api/periodos; GET /api/carreras usa el tipo Carrera.
export interface OpcionPeriodo extends PeriodoResumen {
  activo: boolean
}

// Cuerpo de POST /api/secciones/:id/alumnos (GES-15). El nombre solo se exige
// si el alumno no tiene cuenta y hay que crearla.
export interface AgregarAlumno {
  correo: string
  nombre?: string
}

// Alumno de una sección (GES-15 y GES-18).
export interface AlumnoInscrito {
  id: string
  nombre: string
  correo: string
}

// Respuesta de POST /api/secciones/:id/alumnos. passwordProvisoria viene solo
// si se creó la cuenta, y no se puede volver a pedir.
export interface AlumnoAgregado {
  alumno: AlumnoInscrito
  cuentaCreada: boolean
  passwordProvisoria?: string
}

// GES-13: usuarios disponibles para asignar a una sección.
export interface AyudanteResumen {
  id: string
  nombre: string
  correo: string
}

export interface AyudanteOpcion extends AyudanteResumen {
  asignado: boolean
}

// Agrega asignaciones; no reemplaza ni quita las existentes (GES-14).
export interface AsignarAyudantes {
  ayudanteIds: string[]
}

// Respuesta de GET /api/secciones/:id/alumnos (GES-18): las inscripciones
// activas, por nombre (orden alfabético en español) y después por correo.
export interface AlumnosSeccion {
  seccion: {
    id: string
    numero: number
    curso: { id: string; codigo: string; nombre: string }
  }
  alumnos: AlumnoInscrito[]
  total: number
}

// Respuesta de PATCH /api/secciones/:seccionId/alumnos/:usuarioId/quitar
// (GES-19). Quitar archiva la inscripción: la cuenta del alumno sigue igual.
export interface AlumnoQuitado {
  alumno: AlumnoInscrito
  // Fecha ISO 8601 en que se archivó la inscripción.
  quitadoEn: string
  quitadoPor: { id: string; nombre: string }
}
