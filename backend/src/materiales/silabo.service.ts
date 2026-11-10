import type { VersionSilabo } from '@cursus/shared'
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  BaseDeDatos,
  type ContextoUniversidad,
} from '../database/base-de-datos.service.js'
import type { SeccionEspacio } from '@cursus/shared'

interface FilaVersion {
  version: number
  subido_en: Date
}

interface FilaSilabo extends FilaVersion {
  contenido: Buffer
}

const VERSION = (fila: FilaVersion): VersionSilabo => ({
  version: fila.version,
  subidoEn: fila.subido_en.toISOString(),
})

@Injectable()
export class SilaboService {
  constructor(private readonly bd: BaseDeDatos) {}

  async listar(
    contexto: ContextoUniversidad,
    seccion: SeccionEspacio,
  ): Promise<VersionSilabo[]> {
    const filas =
      contexto.rol === 'DIRECTOR'
        ? await this.bd.consultarEnTodasLasUniversidades<FilaVersion>(
            contexto,
            `SELECT version, subido_en FROM silabo
              WHERE curso_id = $1 ORDER BY version DESC`,
            [seccion.curso.id],
          )
        : await this.bd.consultarEnUniversidad<FilaVersion>(
            contexto,
            `SELECT version, subido_en FROM silabo
              WHERE universidad_id = $1 AND curso_id = $2
              ORDER BY version DESC`,
            [seccion.curso.id],
          )
    return filas.map(VERSION)
  }

  async obtener(
    contexto: ContextoUniversidad,
    seccion: SeccionEspacio,
    version: number,
  ): Promise<Buffer> {
    const fila =
      contexto.rol === 'DIRECTOR'
        ? await this.unaVersionGlobal(contexto, seccion.curso.id, version)
        : await this.bd.obtenerEnUniversidad<FilaSilabo>(
            contexto,
            `SELECT version, subido_en, contenido FROM silabo
              WHERE universidad_id = $1 AND curso_id = $2 AND version = $3`,
            [seccion.curso.id, version],
          )
    return fila.contenido
  }

  private async unaVersionGlobal(
    contexto: ContextoUniversidad,
    cursoId: string,
    version: number,
  ): Promise<FilaSilabo> {
    const [fila] = await this.bd.consultarEnTodasLasUniversidades<FilaSilabo>(
      contexto,
      `SELECT version, subido_en, contenido FROM silabo
        WHERE curso_id = $1 AND version = $2`,
      [cursoId, version],
    )
    if (!fila) throw new NotFoundException()
    return fila
  }

  async subir(
    contexto: ContextoUniversidad,
    usuarioId: string,
    seccion: SeccionEspacio,
    contenido: Buffer,
  ): Promise<VersionSilabo> {
    return this.bd.enTransaccionEnUniversidad(contexto, async (bd) => {
      const [asignacion] = await bd.query<{ profesor: boolean }>(
        `SELECT s.profesor_id = $3 AS profesor
           FROM seccion s
           JOIN curso c ON c.id = s.curso_id AND c.universidad_id = s.universidad_id
          WHERE s.universidad_id = $1 AND s.id = $2
            AND s.archived_at IS NULL AND c.archived_at IS NULL
          FOR UPDATE OF s, c`,
        [contexto.universidadId, seccion.id, usuarioId],
      )
      if (!asignacion) throw new NotFoundException('El curso no existe')
      if (!asignacion.profesor) {
        throw new ForbiddenException(
          'Solo el profesor del curso carga el sílabo',
        )
      }

      const [fila] = await bd.query<FilaVersion>(
        `INSERT INTO silabo (universidad_id, curso_id, version, contenido)
         SELECT $1, $2, COALESCE(MAX(version), 0) + 1, $3
           FROM silabo WHERE universidad_id = $1 AND curso_id = $2
         RETURNING version, subido_en`,
        [contexto.universidadId, seccion.curso.id, contenido],
      )
      return VERSION(fila)
    })
  }
}
