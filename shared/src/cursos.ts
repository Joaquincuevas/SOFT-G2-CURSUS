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

// Sección dentro del detalle del curso. Horario, profesor, ayudantes y
// alumnos consideran sus asignaciones activas. Sin horario llega null.
export interface SeccionDetalle {
  id: string
  numero: number
  horario: string | null
  // Nombre del profesor a cargo (GES-12), o null si no tiene.
  profesor: string | null
  // Su id, para que quitarlo (GES-14) apunte a la persona que se ve.
  profesorId: string | null
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

// Opción de GET /api/profesores (GES-12): profesores de la universidad.
export interface ProfesorOpcion {
  id: string
  nombre: string
}

// Cuerpo de PUT /api/secciones/:id/profesor (GES-12).
export interface AsignarProfesor {
  profesorId: string
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

// GES-14: quitar al profesor o a un ayudante de una sección. El motivo es
// obligatorio y queda en el historial de asignaciones (asignacion_cambio).
export const LARGO_MOTIVO_ASIGNACION = 500

// Body de PATCH /api/secciones/:id/profesor/quitar y de
// PATCH /api/secciones/:id/ayudantes/:usuarioId/quitar.
export interface QuitarAsignacion {
  motivo: string
}

// Body de PATCH /api/secciones/:id/profesor/quitar: además del motivo, el
// profesor que se confirmó quitar. Si la sección ya tiene otro (o ninguno),
// responde 409 con un ProfesorCambiado y no quita a nadie.
export interface QuitarProfesor extends QuitarAsignacion {
  profesorId: string
}

// Cuerpo del 409 al quitar al profesor: quién está a cargo ahora.
export interface ProfesorCambiado {
  statusCode: 409
  message: string
  profesor: ProfesorOpcion | null
}

// Respuesta al quitar una asignación: quién se quitó, quién y cuándo, y el
// motivo, tal como quedaron en el historial.
export interface AsignacionQuitada {
  quitado: { id: string; nombre: string }
  // Fecha ISO 8601 del cambio.
  quitadoEn: string
  quitadoPor: { id: string; nombre: string }
  motivo: string
}

// Al quitar un ayudante, también llegan los que siguen asignados.
export interface AyudanteQuitado extends AsignacionQuitada {
  ayudantes: AyudanteResumen[]
}

// Roles de las cuentas que crea el administrativo en /docentes (GES-21).
export const ROLES_DOCENTES = ['PROFESOR', 'AYUDANTE'] as const
export type RolDocente = (typeof ROLES_DOCENTES)[number]

// Cuerpo de POST /api/usuarios (GES-21).
export interface CrearDocente {
  nombre: string
  correo: string
  rol: RolDocente
}

// Respuesta de POST /api/usuarios. La contraseña provisoria solo va en esta
// respuesta y no se puede volver a pedir.
export interface DocenteCreado {
  usuario: { id: string; nombre: string; correo: string; rol: RolDocente }
  passwordProvisoria: string
}
