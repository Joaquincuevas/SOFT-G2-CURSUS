// MAT-08 (RN-08): actividades de entrega de una sección
// (/api/espacio/secciones/:id/actividades). Cada actividad es de una
// sección: el profesor que la crea y quienes la ven son los de esa sección.

export const LARGO_TITULO_ACTIVIDAD = 100
export const LARGO_INSTRUCCIONES_ACTIVIDAD = 2000

// Elemento de GET y respuesta del POST.
export interface Actividad {
  id: string
  titulo: string
  instrucciones: string
  // Fecha y hora límite, ISO 8601.
  plazo: string
  // true cuando el plazo ya pasó (según la hora del servidor).
  cerrada: boolean
}

// Body de POST. La fecha y la hora límite son de Chile
// (ZONA_HORARIA_UNIVERSIDAD): el backend las convierte, así que no dependen
// de la zona horaria del navegador.
export interface CrearActividad {
  titulo: string
  instrucciones: string
  // YYYY-MM-DD, dentro del período del curso.
  fecha: string
  // HH:mm.
  hora: string
}
