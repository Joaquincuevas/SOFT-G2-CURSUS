import { strFromU8, unzipSync } from 'fflate'
import { afterEach, expect, test, vi } from 'vitest'
import { descargarZipEntregas } from './zipEntregas'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

test('descarga un ZIP válido con los nombres y contenidos de todas las entregas', async () => {
  const crear = vi.fn<(blob: Blob) => string>(() => 'blob:zip')
  vi.stubGlobal('URL', { createObjectURL: crear, revokeObjectURL: vi.fn() })
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => Promise.resolve(new Response(url))),
  )
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(() => {})
  await descargarZipEntregas([
    { nombre: '1-ana@uni.cl.pdf', url: 'https://s3.test/ana' },
    { nombre: '2-luis@uni.cl.pdf', url: 'https://s3.test/luis' },
  ])
  const blob = crear.mock.calls[0][0]
  const bytes = await new Promise<ArrayBuffer>((resolve, reject) => {
    const lector = new FileReader()
    lector.onload = () => resolve(lector.result as ArrayBuffer)
    lector.onerror = reject
    lector.readAsArrayBuffer(blob)
  })
  const archivos = unzipSync(new Uint8Array(bytes))
  expect(
    Object.entries(archivos).map(([nombre, datos]) => [
      nombre,
      strFromU8(datos),
    ]),
  ).toEqual([
    ['1-ana@uni.cl.pdf', 'https://s3.test/ana'],
    ['2-luis@uni.cl.pdf', 'https://s3.test/luis'],
  ])
  expect(click).toHaveBeenCalledTimes(1)
})

test('si un archivo falla no se descarga un ZIP parcial', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response('primera entrega'))
    .mockResolvedValueOnce(new Response(null, { status: 403 }))
  vi.stubGlobal('fetch', fetch)
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(() => {})
  await expect(
    descargarZipEntregas([
      { nombre: 'primera.pdf', url: 'https://s3.test/1' },
      { nombre: 'segunda.pdf', url: 'https://s3.test/2' },
    ]),
  ).rejects.toThrow('Entrega no disponible')
  expect(click).not.toHaveBeenCalled()
})
