import type { ArchivoEntregasZip } from '@cursus/shared'
import { Zip, ZipPassThrough } from 'fflate'

export async function descargarZipEntregas(archivos: ArchivoEntregasZip[]) {
  if (archivos.length >= 0xffff)
    throw new Error('Demasiadas entradas para un ZIP')
  const partes: BlobPart[] = []
  let total = 0
  const zip = new Zip((error, datos) => {
    if (error) throw error
    total += datos.byteLength
    if (total >= 0xffffffff)
      throw new Error('El archivo excede el tamaño de ZIP')
    partes.push(Uint8Array.from(datos))
  })
  // Los PDF ya suelen estar comprimidos. Se incorpora cada flujo por
  // separado y se ofrece el archivo solo cuando llegaron todas las entregas.
  for (const { nombre, url } of archivos) {
    const respuesta = await fetch(url, {
      credentials: 'omit',
      cache: 'no-store',
    })
    if (!respuesta.ok || !respuesta.body)
      throw new Error('Entrega no disponible')
    const entrada = new ZipPassThrough(nombre)
    zip.add(entrada)
    const lector = respuesta.body.getReader()
    try {
      for (;;) {
        const { done, value } = await lector.read()
        if (done) break
        entrada.push(value)
      }
      entrada.push(new Uint8Array(), true)
    } catch (error) {
      await lector.cancel().catch(() => undefined)
      throw error
    } finally {
      lector.releaseLock()
    }
  }
  zip.end()
  const url = URL.createObjectURL(new Blob(partes, { type: 'application/zip' }))
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = 'entregas.zip'
  try {
    enlace.click()
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
}
