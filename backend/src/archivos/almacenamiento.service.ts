import {
  GetObjectCommand,
  HeadObjectCommand,
  NotFound,
  S3Client,
} from '@aws-sdk/client-s3'
import { createPresignedPost } from '@aws-sdk/s3-presigned-post'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { Injectable, ServiceUnavailableException } from '@nestjs/common'

// Duración de las URLs firmadas (MAT-01: "de corta duración"). La subida da
// tiempo para enviar 20 MB con una conexión lenta.
export const SEGUNDOS_SUBIDA = 10 * 60
export const SEGUNDOS_DESCARGA = 5 * 60

export interface SubidaFirmada {
  url: string
  campos: Record<string, string>
  expiraEn: Date
}

export interface ObjetoSubido {
  tamano: number
  tipo: string | undefined
}

// Configuración del bucket desde el entorno. En AWS la define cursus.yml y las
// credenciales vienen del rol de la tarea; en local apunta a LocalStack
// (docker-compose.yml) con S3_ENDPOINT y llaves de prueba (ver .env.example).
export interface ConfiguracionAlmacenamiento {
  bucket: string
  region: string
  endpoint?: string
  credenciales?: { accessKeyId: string; secretAccessKey: string }
}

export function configuracionDesde(
  entorno: NodeJS.ProcessEnv = process.env,
): ConfiguracionAlmacenamiento | null {
  const bucket = entorno.S3_BUCKET
  if (!bucket) return null
  const {
    S3_ACCESS_KEY_ID: accessKeyId,
    S3_SECRET_ACCESS_KEY: secretAccessKey,
  } = entorno
  return {
    bucket,
    region: entorno.S3_REGION || entorno.AWS_REGION || 'us-east-2',
    endpoint: entorno.S3_ENDPOINT || undefined,
    credenciales:
      accessKeyId && secretAccessKey
        ? { accessKeyId, secretAccessKey }
        : undefined,
  }
}

// Bucket S3 privado de los archivos de las secciones (MAT-01). Solo firma
// URLs: los archivos no pasan por la API, porque API Gateway acepta hasta
// 10 MB por petición y los archivos llegan a 20 MB.
//
// Sin S3_BUCKET la API arranca igual y estas operaciones responden 503: así un
// entorno sin bucket no deja de funcionar en todo lo demás.
@Injectable()
export class AlmacenamientoService {
  private readonly configuracion = configuracionDesde()
  private readonly cliente = this.configuracion
    ? new S3Client({
        region: this.configuracion.region,
        endpoint: this.configuracion.endpoint,
        // LocalStack no resuelve el bucket como subdominio.
        forcePathStyle: !!this.configuracion.endpoint,
        credentials: this.configuracion.credenciales,
      })
    : null

  private conectado(): { cliente: S3Client; bucket: string } {
    if (!this.cliente || !this.configuracion) {
      throw new ServiceUnavailableException(
        'El almacenamiento de archivos no está disponible',
      )
    }
    return { cliente: this.cliente, bucket: this.configuracion.bucket }
  }

  // POST firmado para subir exactamente un archivo de este tamaño y tipo a la
  // clave. S3 rechaza cualquier otro: más o menos bytes (400), otro tipo (403)
  // u otra clave, o una firma vencida.
  async firmarSubida(
    clave: string,
    tipo: string,
    tamano: number,
  ): Promise<SubidaFirmada> {
    const { cliente, bucket } = this.conectado()
    const { url, fields } = await createPresignedPost(cliente, {
      Bucket: bucket,
      Key: clave,
      Conditions: [
        ['content-length-range', tamano, tamano],
        ['eq', '$Content-Type', tipo],
      ],
      Fields: { 'Content-Type': tipo },
      Expires: SEGUNDOS_SUBIDA,
    })
    return {
      url,
      campos: fields,
      expiraEn: new Date(Date.now() + SEGUNDOS_SUBIDA * 1000),
    }
  }

  // URL firmada para descargar el objeto con su nombre original.
  async firmarDescarga(
    clave: string,
    nombre: string,
  ): Promise<{ url: string; expiraEn: Date }> {
    const { cliente, bucket } = this.conectado()
    const url = await getSignedUrl(
      cliente,
      new GetObjectCommand({
        Bucket: bucket,
        Key: clave,
        ResponseContentDisposition: disposicionDescarga(nombre),
      }),
      { expiresIn: SEGUNDOS_DESCARGA },
    )
    return { url, expiraEn: new Date(Date.now() + SEGUNDOS_DESCARGA * 1000) }
  }

  // Tamaño y tipo del objeto ya subido, o null si todavía no está en S3.
  async objetoSubido(clave: string): Promise<ObjetoSubido | null> {
    const { cliente, bucket } = this.conectado()
    try {
      const objeto = await cliente.send(
        new HeadObjectCommand({ Bucket: bucket, Key: clave }),
      )
      return { tamano: objeto.ContentLength ?? 0, tipo: objeto.ContentType }
    } catch (error) {
      if (error instanceof NotFound) return null
      throw error
    }
  }
}

// Content-Disposition de la descarga (RFC 6266). filename lleva una versión
// ASCII para navegadores antiguos y filename* el nombre original con tildes.
export function disposicionDescarga(nombre: string): string {
  const ascii = nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]|["\\]/g, '_')
  const codificado = encodeURIComponent(nombre).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  )
  return `attachment; filename="${ascii}"; filename*=UTF-8''${codificado}`
}
