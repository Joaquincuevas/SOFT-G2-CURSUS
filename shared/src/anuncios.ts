// Anuncios de un curso (ANU-01, RN-09). Se publican desde el espacio de una
// sección, pero son del curso: los ven los integrantes de todas sus
// secciones.

export const LARGO_TITULO_ANUNCIO = 200
export const LARGO_CUERPO_ANUNCIO = 5000

// Cuerpo de POST /api/espacio/secciones/:id/anuncios.
export interface PublicarAnuncio {
  titulo: string
  cuerpo: string
}

// Elemento de GET /api/espacio/secciones/:id/anuncios y respuesta del POST.
export interface Anuncio {
  id: string
  titulo: string
  cuerpo: string
  autor: { id: string; nombre: string }
  // Fecha ISO 8601 de publicación.
  publicadoEn: string
}
