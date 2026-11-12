import type { ArchivoResumen } from './archivos.js'

// MAT-08 (RN-08): actividades de entrega de una sección
// (/api/espacio/secciones/:id/actividades). Cada actividad es de una
// sección: el profesor que la crea y quienes la ven son los de esa sección.

export const LARGO_TITULO_ACTIVIDAD = 100
export const LARGO_INSTRUCCIONES_ACTIVIDAD = 2000

export interface SilaboVigente {
  silabo: Pick<VersionSilabo, 'version' | 'subidoEn'> | null
}

export const MAX_TAMANO_SILABO_BYTES = 10 * 1024 * 1024

export interface VersionSilabo {
  version: number
  subidoEn: string
  responsable: string
}

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

// MAT-04: materiales de un curso (/api/espacio/secciones/:id/materiales).
// Cada material es del curso, no de quien lo subió: lo ven y lo gestionan los
// profesores vigentes de cualquier sección del curso, así que lo hereda el
// próximo profesor. Su contenido es un archivo de MAT-01 ya confirmado.

export const CATEGORIAS_MATERIAL = [
  'GUIA',
  'PRESENTACION',
  'PRUEBA_ANTERIOR',
  'CODIGO',
] as const

export type CategoriaMaterial = (typeof CATEGORIAS_MATERIAL)[number]

export const CATEGORIA_MATERIAL_LABEL: Record<CategoriaMaterial, string> = {
  GUIA: 'Guía',
  PRESENTACION: 'Presentación',
  PRUEBA_ANTERIOR: 'Prueba anterior',
  CODIGO: 'Código',
}

export const LARGO_TITULO_MATERIAL = 100
export const LARGO_DESCRIPCION_MATERIAL = 1000

// Body de POST. archivoId es un archivo de la sección ya confirmado
// (MAT-01: pedir la subida, subir a S3 y confirmar).
export interface CrearMaterial {
  archivoId: string
  categoria: CategoriaMaterial
  titulo: string
  descripcion?: string
}

// Elemento de GET y respuesta del POST.
export interface Material {
  id: string
  categoria: CategoriaMaterial
  titulo: string
  descripcion: string | null
  archivo: ArchivoResumen
  // Fecha ISO 8601 en que se registró el material.
  creadoEn: string
}

// MAT-09: el archivo ya pasó por la subida y confirmación de MAT-01.
export interface EntregarInforme {
  archivoId: string
}

export interface EntregaInforme {
  id: string
  archivo: ArchivoResumen
  // Hora del servidor en ISO 8601, no la del navegador ni la de la subida.
  entregadaEn: string
}

export interface MiEntregaActividad {
  entrega: EntregaInforme | null
  cerrada: boolean
}

// MAT-10: GET /api/espacio/secciones/:id/actividades/:actividadId/entregas,
// para el profesor y los ayudantes de la sección. Un elemento por alumno
// inscrito vigente, con su última entrega o null si no entregó. versiones
// cuenta las entregas del alumno en la actividad (la última incluida). La
// descarga (…/entregas/:entregaId/descarga) responde DescargaArchivo.
export interface EntregaDeAlumno {
  alumno: { id: string; nombre: string; correo: string }
  entrega: (EntregaInforme & { versiones: number }) | null
}
