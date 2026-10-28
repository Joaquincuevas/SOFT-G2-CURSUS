// Anuncios para todo el curso o una sección (ANU-01/02, RN-09).

export const LARGO_TITULO_ANUNCIO = 200
export const LARGO_CUERPO_ANUNCIO = 5000
export const MAX_ANUNCIOS_LECTURA = 100

// Cuerpo de POST /api/espacio/secciones/:id/anuncios.
export interface PublicarAnuncio {
  titulo: string
  cuerpo: string
  // Ausente o null: todo el curso. UUID: la sección desde la que se publica.
  seccionId?: string | null
}

// Elemento de GET /api/espacio/secciones/:id/anuncios y respuesta del POST.
export interface Anuncio {
  id: string
  titulo: string
  cuerpo: string
  autor: { id: string; nombre: string }
  // Fecha ISO 8601 de publicación.
  publicadoEn: string
  seccion: { id: string; numero: number } | null
  // Presente en el GET del alumno; ausente en publicación y otros roles.
  nuevo?: boolean
}

// POST /api/espacio/secciones/:id/anuncios/lecturas. Solo IDs ya mostrados.
export interface RegistrarLecturaAnuncios {
  anuncioIds: string[]
}
