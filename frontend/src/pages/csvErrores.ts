import { type FilaCargaAlumnos, MENSAJES_MOTIVO_CSV } from '@cursus/shared'

type FilaConError = Extract<FilaCargaAlumnos, { estado: 'error' }>

// Celda CSV (RFC 4180): entre comillas si trae comillas, coma o salto de
// línea, con las comillas duplicadas.
const celda = (valor: string) =>
  /[",\r\n]/.test(valor) ? `"${valor.replaceAll('"', '""')}"` : valor

// CSV de las filas con error (GES-17), con la cabecera correo,nombre,motivo
// que acepta la carga para volver a subirlo corregido. Sin contraseñas ni
// filas cargadas. El BOM hace que Excel lea bien las tildes.
export function csvDeErrores(filas: FilaConError[]): string {
  const lineas = [
    'correo,nombre,motivo',
    ...filas.map((fila) =>
      [fila.correo, fila.nombre, MENSAJES_MOTIVO_CSV[fila.motivo]]
        .map(celda)
        .join(','),
    ),
  ]
  return `\uFEFF${lineas.join('\r\n')}\r\n`
}

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
