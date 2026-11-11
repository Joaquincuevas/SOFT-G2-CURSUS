import {
  MAX_TAMANO_SILABO_BYTES,
  type DescargaArchivo,
  type SeccionEspacio,
  type VersionSilabo,
} from '@cursus/shared'
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { AlmacenamientoService } from '../archivos/almacenamiento.service.js'
import {
  BaseDeDatos,
  fijarUsuario,
  type ContextoUniversidad,
} from '../database/base-de-datos.service.js'

interface FilaVersion {
  version: number
  subido_en: Date
  responsable: string
}

const versionDe = (fila: FilaVersion): VersionSilabo => ({
  version: fila.version,
  subidoEn: fila.subido_en.toISOString(),
  responsable: fila.responsable,
})

const DESDE_SILABO = `FROM silabo si
  JOIN usuario u ON u.id = si.subido_por AND u.universidad_id = si.universidad_id
  JOIN archivo a ON a.id = si.archivo_id AND a.universidad_id = si.universidad_id
  WHERE si.universidad_id = $1 AND si.curso_id = $2`

@Injectable()
export class SilaboService {
  constructor(
    private readonly bd: BaseDeDatos,
    private readonly almacenamiento: AlmacenamientoService,
  ) {}

  async listar(
    contexto: ContextoUniversidad,
    seccion: SeccionEspacio,
    usuarioId: string,
  ) {
    return this.bd.enTransaccionEnUniversidad(contexto, async (bd) => {
      await fijarUsuario(bd, usuarioId)
      const filas = await bd.query<FilaVersion>(
        `SELECT si.version, si.subido_en, u.nombre AS responsable ${DESDE_SILABO}
         ORDER BY si.version DESC`,
        [contexto.universidadId, seccion.curso.id],
      )
      return filas.map(versionDe)
    })
  }

  async descargar(
    contexto: ContextoUniversidad,
    seccion: SeccionEspacio,
    usuarioId: string,
    version: number,
  ): Promise<DescargaArchivo> {
    const fila = await this.bd.enTransaccionEnUniversidad(
      contexto,
      async (bd) => {
        await fijarUsuario(bd, usuarioId)
        const [pdf] = await bd.query<{
          clave: string
          nombre: string
          version_objeto: string
        }>(
          `SELECT a.clave, a.nombre, si.version_objeto ${DESDE_SILABO}
           AND si.version = $3 AND a.archived_at IS NULL`,
          [contexto.universidadId, seccion.curso.id, version],
        )
        return pdf
      },
    )
    if (!fila) throw new NotFoundException('La versión del sílabo no existe')
    const { url, expiraEn } = await this.almacenamiento.firmarDescarga(
      fila.clave,
      fila.nombre,
      fila.version_objeto,
    )
    return { url, expiraEn: expiraEn.toISOString() }
  }

  async publicar(
    contexto: ContextoUniversidad,
    seccion: SeccionEspacio,
    usuarioId: string,
    archivoId: string,
  ) {
    try {
      return await this.bd.enTransaccionEnUniversidad(contexto, async (bd) => {
        await fijarUsuario(bd, usuarioId)
        const [acceso] = await bd.query<{ profesor: boolean }>(
          `SELECT es_profesor_de_seccion(s.id, $3) AS profesor
             FROM seccion s JOIN curso c ON c.id = s.curso_id AND c.universidad_id = s.universidad_id
            WHERE s.universidad_id = $1 AND s.id = $2
              AND s.archived_at IS NULL AND c.archived_at IS NULL
            FOR UPDATE OF c`,
          [contexto.universidadId, seccion.id, usuarioId],
        )
        if (!acceso?.profesor) throw new ForbiddenException()
        const [archivo] = await bd.query<{ clave: string; tamano: number }>(
          `SELECT clave, tamano FROM archivo
            WHERE universidad_id = $1 AND seccion_id = $2 AND id = $3
              AND subido_por = $4 AND subido_como = 'PROFESOR'
              AND tipo = 'application/pdf' AND tamano BETWEEN 5 AND $5
              AND subido_at IS NOT NULL AND archived_at IS NULL`,
          [
            contexto.universidadId,
            seccion.id,
            archivoId,
            usuarioId,
            MAX_TAMANO_SILABO_BYTES,
          ],
        )
        if (!archivo)
          throw new BadRequestException(
            'Elige un PDF propio confirmado de esta sección de hasta 10 MiB',
          )
        const [previa] = await bd.query<FilaVersion>(
          `SELECT si.version, si.subido_en, u.nombre AS responsable ${DESDE_SILABO} AND si.archivo_id = $3`,
          [contexto.universidadId, seccion.curso.id, archivoId],
        )
        if (previa) return versionDe(previa)
        const objeto = await this.almacenamiento.objetoSubido(archivo.clave)
        if (
          objeto?.tipo !== 'application/pdf' ||
          objeto.tamano !== archivo.tamano
        ) {
          throw new BadRequestException(
            'El PDF subido no coincide con el archivo confirmado',
          )
        }
        if (!objeto.version || objeto.version === 'null') {
          throw new ServiceUnavailableException(
            'El almacenamiento debe tener versionado activo',
          )
        }
        if (
          !(await this.almacenamiento.tieneCabeceraPdf(
            archivo.clave,
            objeto.version,
          ))
        ) {
          throw new BadRequestException('El archivo debe ser un PDF válido')
        }
        const [fila] = await bd.query<FilaVersion>(
          `WITH nueva AS (
             INSERT INTO silabo (universidad_id, curso_id, version, archivo_id, subido_por, version_objeto)
             SELECT $1, $2, COALESCE(MAX(version), 0) + 1, $3, $4, $5
               FROM silabo WHERE universidad_id = $1 AND curso_id = $2
             RETURNING version, subido_en, subido_por
           )
           SELECT n.version, n.subido_en, u.nombre AS responsable
             FROM nueva n JOIN usuario u ON u.id = n.subido_por AND u.universidad_id = $1`,
          [
            contexto.universidadId,
            seccion.curso.id,
            archivoId,
            usuarioId,
            objeto.version,
          ],
        )
        return versionDe(fila)
      })
    } catch (error) {
      if ((error as { code?: string }).code === '42501')
        throw new ForbiddenException()
      throw error
    }
  }
}
