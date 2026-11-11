import type { SubidaArchivo } from '@cursus/shared'

// Falla la subida directa a S3. status es el de S3 (por ejemplo, 400 si el
// tamaño no calza o 403 si la firma venció), o 0 si no hubo respuesta.
export class ErrorSubidaS3 extends Error {
  readonly status: number

  constructor(status: number) {
    super(`S3 respondió ${status}`)
    this.status = status
  }
}

// MAT-01: sube el archivo directo a S3 con la subida firmada que entregó el
// backend. Es un POST multipart: los campos de la firma, en orden, y el
// archivo al final en el campo "file". Usa XMLHttpRequest y no fetch porque
// fetch no informa el progreso de una subida. S3 responde 204.
export function subirAS3(
  subida: SubidaArchivo['subida'],
  archivo: File,
  alProgreso: (porcentaje: number) => void,
): Promise<void> {
  return new Promise((resolver, rechazar) => {
    const formulario = new FormData()
    for (const [campo, valor] of Object.entries(subida.campos)) {
      formulario.append(campo, valor)
    }
    formulario.append('file', archivo)

    const xhr = new XMLHttpRequest()
    xhr.open('POST', subida.url)
    xhr.upload.onprogress = (evento) => {
      if (evento.lengthComputable && evento.total > 0) {
        alProgreso(Math.round((evento.loaded / evento.total) * 100))
      }
    }
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolver()
        : rechazar(new ErrorSubidaS3(xhr.status))
    // Sin respuesta: sin conexión, bloqueado por CORS o cancelado.
    xhr.onerror =
      xhr.onabort =
      xhr.ontimeout =
        () => rechazar(new ErrorSubidaS3(0))
    xhr.send(formulario)
  })
}

// Tamaño para mostrar: 2048 → "2 KB".
export function tamanoLegible(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.0', '')} MB`
}
