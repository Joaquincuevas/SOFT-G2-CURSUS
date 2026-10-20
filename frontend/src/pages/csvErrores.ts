// Descarga un texto como archivo, sin pasar por el servidor. La URL del Blob
// se libera después de que el navegador empieza la descarga.
export function descargar(nombre: string, contenido: string) {
  const url = URL.createObjectURL(
    new Blob([contenido], { type: 'text/csv;charset=utf-8' }),
  )
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombre
  enlace.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
