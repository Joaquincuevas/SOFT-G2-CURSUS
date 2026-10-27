// Anuncios para todo el curso o una sección (ANU-01/02, RN-09).

export const LARGO_TITULO_ANUNCIO = 200
export const LARGO_CUERPO_ANUNCIO = 5000

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
}
