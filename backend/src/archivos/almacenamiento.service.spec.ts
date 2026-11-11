import { tipoDeArchivo } from '@cursus/shared'
import { ServiceUnavailableException } from '@nestjs/common'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AlmacenamientoService,
  configuracionDesde,
  disposicionDescarga,
  SEGUNDOS_DESCARGA,
  SEGUNDOS_SUBIDA,
} from './almacenamiento.service.js'

// Firmar no usa la red: basta con llaves cualesquiera.
const ENTORNO = {
  S3_BUCKET: 'bucket-prueba',
  S3_REGION: 'us-east-2',
  S3_ACCESS_KEY_ID: 'AKIAPRUEBA',
  S3_SECRET_ACCESS_KEY: 'secreto-de-prueba',
}

function servicioCon(entorno: Record<string, string>) {
  for (const [nombre, valor] of Object.entries(entorno)) {
    vi.stubEnv(nombre, valor)
  }
  return new AlmacenamientoService()
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('configuracionDesde', () => {
  it('sin S3_BUCKET no hay almacenamiento', () => {
    expect(configuracionDesde({})).toBeNull()
  })

  it('en AWS usa el rol de la tarea: sin endpoint ni llaves', () => {
    expect(
      configuracionDesde({ S3_BUCKET: 'b', S3_REGION: 'us-east-2' }),
    ).toEqual({
      bucket: 'b',
      region: 'us-east-2',
      endpoint: undefined,
      credenciales: undefined,
    })
  })

  it('en local usa el endpoint y las llaves de LocalStack', () => {
    expect(
      configuracionDesde({
        ...ENTORNO,
        S3_ENDPOINT: 'http://localhost:4566',
      }),
    ).toMatchObject({
      endpoint: 'http://localhost:4566',
      credenciales: {
        accessKeyId: 'AKIAPRUEBA',
        secretAccessKey: 'secreto-de-prueba',
      },
    })
  })
})

describe('AlmacenamientoService', () => {
  it('sin bucket responde 503 en vez de firmar', async () => {
    vi.stubEnv('S3_BUCKET', '')
    const servicio = new AlmacenamientoService()
    await expect(
      servicio.firmarSubida('u/s/a', 'application/pdf', 10),
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
    await expect(
      servicio.firmarDescarga('u/s/a', 'a.pdf'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
  })

  it('la subida firmada exige la clave, el tamaño exacto y el tipo', async () => {
    const antes = Date.now()
    const subida = await servicioCon(ENTORNO).firmarSubida(
      'u/s/a',
      'application/x-ipynb+json',
      1234,
    )

    expect(subida.url).toBe('https://bucket-prueba.s3.us-east-2.amazonaws.com/')
    expect(subida.campos).toMatchObject({
      key: 'u/s/a',
      'Content-Type': 'application/x-ipynb+json',
    })
    const politica = JSON.parse(
      Buffer.from(subida.campos.Policy, 'base64').toString(),
    ) as { expiration: string; conditions: unknown[] }
    expect(politica.conditions).toEqual(
      expect.arrayContaining([
        { bucket: 'bucket-prueba' },
        { key: 'u/s/a' },
        ['content-length-range', 1234, 1234],
        ['eq', '$Content-Type', 'application/x-ipynb+json'],
      ]),
    )
    const vence = new Date(politica.expiration).getTime()
    expect(vence - antes).toBeGreaterThanOrEqual(SEGUNDOS_SUBIDA * 1000 - 1000)
    expect(vence - antes).toBeLessThanOrEqual(SEGUNDOS_SUBIDA * 1000 + 1000)
  })

  it('la descarga firmada vence pronto y entrega el nombre original', async () => {
    const descarga = await servicioCon(ENTORNO).firmarDescarga(
      'u/s/a',
      'Guía 1.pdf',
    )
    const url = new URL(descarga.url)

    expect(url.host).toBe('bucket-prueba.s3.us-east-2.amazonaws.com')
    expect(url.pathname).toBe('/u/s/a')
    expect(url.searchParams.get('X-Amz-Expires')).toBe(
      String(SEGUNDOS_DESCARGA),
    )
    expect(url.searchParams.get('response-content-disposition')).toBe(
      disposicionDescarga('Guía 1.pdf'),
    )
  })

  it('con endpoint local firma con el bucket en la ruta', async () => {
    const subida = await servicioCon({
      ...ENTORNO,
      S3_ENDPOINT: 'http://localhost:4566',
    }).firmarSubida('u/s/a', 'application/pdf', 10)
    expect(subida.url).toBe('http://localhost:4566/bucket-prueba')
  })
})

describe('disposicionDescarga', () => {
  it('codifica tildes y comillas sin romper el header', () => {
    expect(disposicionDescarga('Guía "final" (v2).pdf')).toBe(
      `attachment; filename="Guia _final_ (v2).pdf"; filename*=UTF-8''Gu%C3%ADa%20%22final%22%20%28v2%29.pdf`,
    )
  })
})

describe('tipoDeArchivo', () => {
  it.each([
    ['informe.PDF', 'application/pdf'],
    ['foto.jpeg', 'image/jpeg'],
    ['cuaderno.ipynb', 'application/x-ipynb+json'],
    ['codigo.tar.zip', 'application/zip'],
  ])('%s es %s', (nombre, tipo) => {
    expect(tipoDeArchivo(nombre)).toBe(tipo)
  })

  it.each([
    'virus.exe',
    'sin-extension',
    '.pdf',
    'pagina.html',
    'x.constructor',
  ])('rechaza %s', (nombre) => {
    expect(tipoDeArchivo(nombre)).toBeNull()
  })
})
