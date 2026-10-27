import type { Anuncio, SeccionEspacio } from '@cursus/shared'
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  BaseDeDatos,
  type ContextoUniversidad,
} from '../database/base-de-datos.service.js'
import type { PublicarAnuncioDto } from './publicar-anuncio.dto.js'

interface FilaAnuncio {
  id: string
  titulo: string
  cuerpo: string
  autor_id: string
  autor_nombre: string
  publicado_en: Date
  seccion_id: string | null
  seccion_numero: number | null
}

const COLUMNAS = `
  a.id, a.titulo, a.cuerpo, u.id AS autor_id, u.nombre AS autor_nombre,
  a.created_at AS publicado_en, a.seccion_id, s.numero AS seccion_numero`

const anuncioDe = (fila: FilaAnuncio): Anuncio => ({
  id: fila.id,
  titulo: fila.titulo,
  cuerpo: fila.cuerpo,
  autor: { id: fila.autor_id, nombre: fila.autor_nombre },
  publicadoEn: fila.publicado_en.toISOString(),
  seccion: fila.seccion_id
    ? { id: fila.seccion_id, numero: fila.seccion_numero as number }
    : null,
})

// ANU-01/02 (RN-09): el guard verifica el acceso y el listado filtra el
// destinatario antes de devolver cualquier título o cuerpo.
@Injectable()
export class AnunciosService {
  constructor(private readonly bd: BaseDeDatos) {}

  // Activos, del más nuevo al más antiguo. El Director lee solo los generales
  // en cualquier universidad, en una transacción READ ONLY.
  async listar(
    contexto: ContextoUniversidad,
    seccion: SeccionEspacio,
  ): Promise<Anuncio[]> {
    const desde = `FROM anuncio a JOIN usuario u ON u.id = a.autor_id AND u.universidad_id = a.universidad_id
      LEFT JOIN seccion s ON s.id = a.seccion_id
        AND s.curso_id = a.curso_id AND s.universidad_id = a.universidad_id`
    const orden =
      'AND a.archived_at IS NULL ORDER BY a.created_at DESC, a.id DESC'
    const filas =
      contexto.rol === 'DIRECTOR'
        ? await this.bd.consultarEnTodasLasUniversidades<FilaAnuncio>(
            contexto,
            `SELECT ${COLUMNAS} ${desde}
              WHERE a.curso_id = $1 AND a.seccion_id IS NULL ${orden}`,
            [seccion.curso.id],
          )
        : await this.bd.consultarEnUniversidad<FilaAnuncio>(
            contexto,
            `SELECT ${COLUMNAS} ${desde}
              WHERE a.universidad_id = $1 AND a.curso_id = $2
                AND (a.seccion_id IS NULL OR a.seccion_id = $3) ${orden}`,
            [seccion.curso.id, seccion.id],
          )
    return filas.map(anuncioDe)
  }

  // Publica para todo el curso o solo esta sección. El INSERT vuelve a exigir que
  // la sección y su curso sigan vigentes y que el usuario siga a cargo de
  // ella, por si cambió después de que el guard la verificara.
  async publicar(
    contexto: ContextoUniversidad,
    usuarioId: string,
    seccion: SeccionEspacio,
    datos: PublicarAnuncioDto,
  ): Promise<Anuncio> {
    if (datos.seccionId != null && datos.seccionId !== seccion.id) {
      throw new BadRequestException(
        'Publica desde la sección destinataria del anuncio',
      )
    }
    return this.bd.enTransaccionEnUniversidad(contexto, async (bd) => {
      const [fila] = await bd.query<FilaAnuncio>(
        `WITH nuevo AS (
           INSERT INTO anuncio (universidad_id, curso_id, autor_id, titulo, cuerpo, seccion_id)
           SELECT $1, c.id, $3, $4, $5, $6::uuid
             FROM seccion s JOIN curso c ON c.id = s.curso_id
            WHERE s.universidad_id = $1 AND s.id = $2
              AND s.archived_at IS NULL AND c.archived_at IS NULL
              AND s.profesor_id = $3
           RETURNING *
         )
         SELECT ${COLUMNAS} FROM nuevo a JOIN usuario u ON u.id = a.autor_id AND u.universidad_id = a.universidad_id
           LEFT JOIN seccion s ON s.id = a.seccion_id
             AND s.curso_id = a.curso_id AND s.universidad_id = a.universidad_id`,
        [
          contexto.universidadId,
          seccion.id,
          usuarioId,
          datos.titulo,
          datos.cuerpo,
          datos.seccionId ?? null,
        ],
      )
      if (fila) {
        return anuncioDe(fila)
      }
      const [vigente] = await bd.query<{ es_profesor: boolean }>(
        `SELECT s.profesor_id IS NOT DISTINCT FROM $3::uuid AS es_profesor
           FROM seccion s JOIN curso c ON c.id = s.curso_id
          WHERE s.universidad_id = $1 AND s.id = $2
            AND s.archived_at IS NULL AND c.archived_at IS NULL`,
        [contexto.universidadId, seccion.id, usuarioId],
      )
      // La sección o su curso se archivaron, o el profesor se reasignó,
      // después de que el guard la verificara.
      if (!vigente) {
        throw new NotFoundException('La sección no existe')
      }
      throw new ForbiddenException(
        'Solo el profesor de la sección publica anuncios',
      )
    })
  }
}
