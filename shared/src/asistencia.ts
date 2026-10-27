// ASI-01 (RN-13): clases de una sección (/api/espacio/secciones/:id/clases).
// Una clase es una copia del bloque del horario (GES-10) en una fecha: el
// horario archiva y recrea sus bloques al guardarse, así que la clase no
// apunta a su id.

export const ZONA_HORARIA_UNIVERSIDAD = 'America/Santiago'

export interface Clase {
  id: string
  // YYYY-MM-DD, dentro del período del curso.
  fecha: string
  // HH:mm, copiados del bloque del horario.
  inicio: string
  termino: string
  sala: string
}

// Body de POST. Sin fecha, el backend usa hoy en America/Santiago. `inicio`
// elige el bloque del horario de ese día de la semana.
export interface CrearClase {
  fecha?: string
  inicio: string
}

// ASI-02 (RN-13): asistencia de una clase
// (/api/espacio/secciones/:id/clases/:claseId/asistencia).

// Un alumno con su marca: null mientras la clase no tiene asistencia. Sin
// correo: la lista también la lee el ayudante (RE-10).
export interface AlumnoAsistencia {
  id: string
  nombre: string
  presente: boolean | null
}

// GET y respuesta del POST. Con asistencia registrada, `alumnos` son las filas
// guardadas (aunque un alumno ya no esté inscrito); sin ella, los alumnos
// activos de la sección.
export interface AsistenciaClase {
  clase: Clase
  registrada: { por: { id: string; nombre: string }; en: string } | null
  alumnos: AlumnoAsistencia[]
}

export interface MarcaAsistencia {
  alumnoId: string
  presente: boolean
}

// Body del POST: una marca por cada alumno activo de la sección.
export interface GuardarAsistencia {
  marcas: MarcaAsistencia[]
}

export const MAX_MARCAS_ASISTENCIA = 1000

// 400 cuando la lista no coincide con los alumnos activos de la sección.
export interface ErrorListaAsistencia {
  statusCode: 400
  message: string
  faltantes: string[]
  sobrantes: string[]
  repetidos: string[]
}
