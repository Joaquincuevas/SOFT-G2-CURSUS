// Fecha de publicación de un anuncio (ANU-01) en la hora local del
// navegador, por ejemplo "26 de octubre de 2026, 22:28".
export const fechaAnuncio = (iso: string) =>
  new Date(iso).toLocaleString('es-CL', {
    dateStyle: 'long',
    timeStyle: 'short',
  })
