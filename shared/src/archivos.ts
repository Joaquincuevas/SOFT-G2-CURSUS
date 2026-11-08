// MAT-01: archivos de una sección, guardados en un bucket S3 privado. El
// navegador sube y descarga directo con URLs firmadas que genera el backend,
// solo para integrantes de la sección. MAT-02, MAT-04 y MAT-09 los usan para
// el sílabo, los materiales y las entregas.

// 20 MB. Además del backend, la firma de la subida lo exige: S3 rechaza un
// archivo de otro tamaño.
export const TAMANO_MAXIMO_ARCHIVO = 20 * 1024 * 1024

export const LARGO_MAXIMO_NOMBRE_ARCHIVO = 255

// Tipos permitidos, por extensión. El tipo se deduce de la extensión y no del
// navegador, que no informa uno confiable para todos (por ejemplo, .ipynb).
// La firma exige este tipo exacto.
export const TIPOS_ARCHIVO = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  zip: 'application/zip',
  txt: 'text/plain',
  ipynb: 'application/x-ipynb+json',
} as const satisfies Record<string, string>

export type ExtensionArchivo = keyof typeof TIPOS_ARCHIVO

// Tipo de un archivo por su extensión (sin importar mayúsculas), o null si
// no está permitido.
export function tipoDeArchivo(nombre: string): string | null {
  const punto = nombre.lastIndexOf('.')
  if (punto <= 0) return null
  const extension = nombre.slice(punto + 1).toLowerCase()
  return Object.hasOwn(TIPOS_ARCHIVO, extension)
    ? TIPOS_ARCHIVO[extension as ExtensionArchivo]
    : null
}

// Body de POST /api/espacio/secciones/:id/archivos: el archivo que se va a
// subir. tamano en bytes.
export interface PedirSubida {
  nombre: string
  tamano: number
}

export interface ArchivoResumen {
  id: string
  nombre: string
  tipo: string
  tamano: number
  // Fecha ISO 8601 en que se confirmó la subida, o null si falta confirmarla.
  subidoEn: string | null
}

// Respuesta de POST /api/espacio/secciones/:id/archivos. El navegador envía
// un POST multipart a url con los campos, en orden, y el archivo al final en
// el campo "file". Después confirma la subida.
export interface SubidaArchivo {
  archivo: ArchivoResumen
  subida: {
    url: string
    campos: Record<string, string>
    // Fecha ISO 8601 en que la firma deja de servir.
    expiraEn: string
  }
}

// Respuesta de GET .../archivos/:archivoId/descarga.
export interface DescargaArchivo {
  url: string
  expiraEn: string
}
