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
