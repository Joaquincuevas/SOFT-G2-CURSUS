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
import { anuncioPendiente, anunciosVisibles } from './anuncios.sql.js'

interface FilaAnuncio {
  id: string
  titulo: string
  cuerpo: string
  autor_id: string
  autor_nombre: string
  publicado_en: Date
  seccion_id: string | null
  seccion_numero: number | null
  nuevo?: boolean
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
  ...(typeof fila.nuevo === 'boolean' ? { nuevo: fila.nuevo } : {}),
})

// ANU-01/02/03/04 (RN-09): el guard verifica el acceso y el listado filtra el
// destinatario antes de devolver cualquier título o cuerpo.
// RLS solo aísla universidades. Listado, conteo y registro de lectura
// reutilizan anunciosVisibles(); consultar anuncio sin ese filtro puede
// revelar anuncios privados. anuncioPendiente() comparte el estado de lectura.
@Injectable()
export class AnunciosService {
  constructor(private readonly bd: BaseDeDatos) {}

  // Activos, del más nuevo al más antiguo; id DESC desempata fechas iguales
  // para mantener un orden estable entre lecturas. El Director lee solo los generales
  // en cualquier universidad, en una transacción READ ONLY.
  async listar(
    contexto: ContextoUniversidad,
    seccion: SeccionEspacio,
    usuarioId: string,
  ): Promise<Anuncio[]> {
    const desde = `FROM anuncio a JOIN usuario u ON u.id = a.autor_id AND u.universidad_id = a.universidad_id
      LEFT JOIN seccion s ON s.id = a.seccion_id
        AND s.curso_id = a.curso_id AND s.universidad_id = a.universidad_id`
    const orden = 'ORDER BY a.created_at DESC, a.id DESC'
    const filas =
      contexto.rol === 'DIRECTOR'
        ? await this.bd.consultarEnTodasLasUniversidades<FilaAnuncio>(
            contexto,
            `SELECT ${COLUMNAS} ${desde}
              WHERE a.curso_id = $1 AND a.seccion_id IS NULL AND a.archived_at IS NULL ${orden}`,
            [seccion.curso.id],
          )
        : await this.bd.consultarEnUniversidad<FilaAnuncio>(
            contexto,
            `SELECT ${COLUMNAS}${contexto.rol === 'ALUMNO' ? `, ${anuncioPendiente('$4')} AS nuevo` : ''} ${desde}
              WHERE ${anunciosVisibles('$2', '$3')} ${orden}`,
            contexto.rol === 'ALUMNO'
              ? [seccion.curso.id, seccion.id, usuarioId]
              : [seccion.curso.id, seccion.id],
          )
    return filas.map(anuncioDe)
  }

  // Marca solo el conjunto recibido por el navegador. Un anuncio publicado
  // después del GET (o aún sin commit durante ese GET) sigue pendiente.
  async registrarLectura(
    contexto: ContextoUniversidad,
    usuarioId: string,
    seccion: SeccionEspacio,
    anuncioIds: string[],
  ): Promise<void> {
    if (contexto.rol !== 'ALUMNO' || seccion.rol !== 'ALUMNO') {
      throw new ForbiddenException('Solo el alumno registra su lectura')
    }
    await this.bd.enTransaccionEnUniversidad(contexto, async (bd) => {
      // Se vuelve a comprobar la inscripción y se la bloquea hasta el commit:
      // una baja que gane antes de esta consulta impide registrar la visita.
      const inscripciones = await bd.query<{ id: string }>(
        `SELECT i.id FROM inscripcion i
          JOIN seccion s ON s.id = i.seccion_id AND s.universidad_id = i.universidad_id
          JOIN curso c ON c.id = s.curso_id AND c.universidad_id = s.universidad_id
          JOIN usuario u ON u.id = i.usuario_id AND u.universidad_id = i.universidad_id
         WHERE i.universidad_id = $1 AND i.usuario_id = $2 AND s.id = $3
           AND i.archived_at IS NULL AND s.archived_at IS NULL
           AND c.archived_at IS NULL AND u.archived_at IS NULL AND u.rol = 'ALUMNO'
         FOR SHARE OF i, s, c, u`,
        [contexto.universidadId, usuarioId, seccion.id],
      )
      if (inscripciones.length === 0) {
        throw new ForbiddenException('No eres integrante de esta sección')
      }
      await bd.query(
        `INSERT INTO lectura_anuncio (universidad_id, alumno_id, anuncio_id)
         SELECT $1, $2, a.id FROM anuncio a
          WHERE ${anunciosVisibles('$4', '$3')} AND a.id = ANY($5::uuid[])
         ORDER BY a.id
         ON CONFLICT (alumno_id, anuncio_id) DO NOTHING`,
        [
          contexto.universidadId,
          usuarioId,
          seccion.id,
          seccion.curso.id,
          anuncioIds,
        ],
      )
    })
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
