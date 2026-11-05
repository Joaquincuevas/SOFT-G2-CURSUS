import type {
  AsistenciaClase,
  AsistenciaPropia,
  CambioAsistencia,
  ErrorListaAsistencia,
  ResumenAsistenciaPropia,
  SeccionEspacio,
} from '@cursus/shared'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  BaseDeDatos,
  type ContextoUniversidad,
} from '../database/base-de-datos.service.js'
import { ALUMNOS_SECCION } from '../gestion/alumnos.sql.js'
import type { GuardarAsistenciaDto } from './guardar-asistencia.dto.js'
import type { CorregirAsistenciaDto } from './corregir-asistencia.dto.js'
import { porcentajeAsistenciaSql } from './porcentaje.sql.js'

// Código de PostgreSQL para una restricción única violada.
const UNIQUE = '23505'
const MARCA_UNICA = 'ux_asistencia_clase_alumno_activa'

// La clase se llama c; su sección, s.
const COLUMNAS_CLASE = `json_build_object(
  'id', c.id, 'fecha', to_char(c.fecha, 'YYYY-MM-DD'),
  'inicio', to_char(c.inicio, 'HH24:MI'), 'termino', to_char(c.termino, 'HH24:MI'),
  'sala', c.sala) AS clase`

// Marcas activas guardadas, en el mismo orden que la lista de alumnos (por
// nombre en español y correo), y quién y cuándo las registró.
const REGISTRO = `
  (SELECT json_agg(json_build_object(
            'id', u.id, 'nombre', u.nombre, 'presente', a.presente)
          ORDER BY u.nombre COLLATE "es-CL-x-icu", u.correo)
     FROM asistencia a JOIN usuario u ON u.id = a.alumno_id AND u.universidad_id = a.universidad_id
    WHERE a.clase_id = c.id AND a.universidad_id = c.universidad_id AND a.archived_at IS NULL) AS marcas,
  (SELECT json_build_object(
            'por', json_build_object('id', r.id, 'nombre', r.nombre),
            'en', a.created_at)
     FROM asistencia a JOIN usuario r ON r.id = a.registrada_por AND r.universidad_id = a.universidad_id
    WHERE a.clase_id = c.id AND a.universidad_id = c.universidad_id AND a.archived_at IS NULL
    ORDER BY a.created_at, a.id LIMIT 1) AS registrada`

const DESDE_CLASE = `
  FROM clase c
  JOIN seccion s ON s.id = c.seccion_id AND s.universidad_id = c.universidad_id
  JOIN curso cu ON cu.id = s.curso_id AND cu.universidad_id = s.universidad_id`

const MARCAS_PROPIAS = `SELECT ${COLUMNAS_CLASE}, a.presente, c.fecha, c.inicio, c.id ${DESDE_CLASE}
  JOIN asistencia a ON a.clase_id = c.id AND a.universidad_id = c.universidad_id
 WHERE c.universidad_id = $1 AND s.id = $2 AND a.alumno_id = $3
   AND c.archived_at IS NULL AND s.archived_at IS NULL AND cu.archived_at IS NULL
   AND a.archived_at IS NULL AND EXISTS (
     SELECT 1 FROM inscripcion i
     JOIN usuario u ON u.id = i.usuario_id AND u.universidad_id = i.universidad_id
     WHERE i.seccion_id = s.id AND i.universidad_id = s.universidad_id
       AND i.usuario_id = $3 AND i.archived_at IS NULL
       AND u.rol = 'ALUMNO' AND u.archived_at IS NULL)`

interface FilaAsistencia {
  clase: AsistenciaClase['clase']
  marcas: AsistenciaClase['alumnos'] | null
  registrada: AsistenciaClase['registrada']
  alumnos: { id: string; nombre: string; correo: string }[]
}

// Arma la respuesta: con asistencia registrada, las filas guardadas (aunque
// un alumno ya no esté inscrito); sin ella, los alumnos activos sin marca.
// Sin correos: la lista también la lee el ayudante (RE-10).
function respuesta(fila: FilaAsistencia): AsistenciaClase {
  return {
    clase: fila.clase,
    registrada: fila.registrada,
    alumnos:
      fila.marcas ??
      fila.alumnos.map(({ id, nombre }) => ({ id, nombre, presente: null })),
  }
}

// IDs repetidos en una lista, en el orden en que aparecen por primera vez.
function repetidos(ids: string[]): string[] {
  const vistos = new Set<string>()
  const dobles = new Set<string>()
  for (const id of ids) {
    if (vistos.has(id)) dobles.add(id)
    vistos.add(id)
  }
  return [...dobles]
}

// ASI-02 (RN-13): asistencia de una clase de una sección que
// IntegranteSeccionGuard ya verificó. El controlador decide quién lee y
// quién guarda.
@Injectable()
export class AsistenciaService {
  constructor(private readonly bd: BaseDeDatos) {}

  private async marcaEditable(
    bd: Pick<BaseDeDatos, 'query'>,
    contexto: ContextoUniversidad,
    profesorId: string,
    seccion: SeccionEspacio,
    claseId: string,
    alumnoId: string,
  ) {
    if (contexto.rol !== 'PROFESOR' || seccion.rol !== 'PROFESOR') {
      throw new ForbiddenException(
        'Solo el profesor de la sección puede corregir la asistencia',
      )
    }
    const [marca] = await bd.query<{
      id: string
      presente: boolean
      es_profesor: boolean
    }>(
      `SELECT a.id, a.presente, s.profesor_id = $5 AS es_profesor
         ${DESDE_CLASE}
         JOIN usuario u ON u.id = $5 AND u.universidad_id = s.universidad_id
         JOIN asistencia a ON a.clase_id = c.id AND a.universidad_id = c.universidad_id
        WHERE c.universidad_id = $1 AND s.id = $2 AND c.id = $3 AND a.alumno_id = $4
          AND c.archived_at IS NULL AND s.archived_at IS NULL AND cu.archived_at IS NULL
          AND a.archived_at IS NULL AND u.archived_at IS NULL AND u.rol = 'PROFESOR'
        FOR SHARE OF c, s, cu, u FOR UPDATE OF a`,
      [contexto.universidadId, seccion.id, claseId, alumnoId, profesorId],
    )
    if (!marca) throw new NotFoundException('La marca de asistencia no existe')
    if (!marca.es_profesor)
      throw new ForbiddenException(
        'Solo el profesor de la sección puede corregir la asistencia',
      )
    return marca
  }

  async corregir(
    contexto: ContextoUniversidad,
    profesorId: string,
    seccion: SeccionEspacio,
    claseId: string,
    alumnoId: string,
    datos: CorregirAsistenciaDto,
  ): Promise<AsistenciaClase> {
    return this.bd.enTransaccionEnUniversidad(contexto, async (bd) => {
      const marca = await this.marcaEditable(
        bd,
        contexto,
        profesorId,
        seccion,
        claseId,
        alumnoId,
      )
      if (marca.presente !== datos.anterior) {
        throw new ConflictException(
          'La marca cambió mientras la editabas. Vuelve a cargar la asistencia',
        )
      }
      if (marca.presente !== datos.presente) {
        await bd.query(
          `SELECT set_config('app.asistencia_profesor_id', $1, true), set_config('app.asistencia_motivo', $2, true)`,
          [profesorId, datos.motivo],
        )
        // El trigger captura OLD y NEW bajo el mismo lock; si falla la
        // auditoría, PostgreSQL revierte también la marca.
        await bd.query(
          'UPDATE asistencia SET presente = $3 WHERE universidad_id = $1 AND id = $2',
          [contexto.universidadId, marca.id, datos.presente],
        )
      }
      const [fila] = await bd.query<FilaAsistencia>(
        `SELECT ${COLUMNAS_CLASE}, ${REGISTRO}, ${ALUMNOS_SECCION} ${DESDE_CLASE}
          WHERE c.universidad_id = $1 AND s.id = $2 AND c.id = $3`,
        [contexto.universidadId, seccion.id, claseId],
      )
      return respuesta(fila)
    })
  }

  async historial(
    contexto: ContextoUniversidad,
    profesorId: string,
    seccion: SeccionEspacio,
    claseId: string,
    alumnoId: string,
  ): Promise<CambioAsistencia[]> {
    return this.bd.enTransaccionEnUniversidad(contexto, async (bd) => {
      const marca = await this.marcaEditable(
        bd,
        contexto,
        profesorId,
        seccion,
        claseId,
        alumnoId,
      )
      const cambios = await bd.query<
        Omit<CambioAsistencia, 'fecha'> & { fecha: Date }
      >(
        `SELECT h.id, h.anterior, h.nuevo, h.motivo, h.fecha,
                json_build_object('id', u.id, 'nombre', u.nombre) AS profesor
           FROM asistencia_cambio h JOIN usuario u ON u.id = h.responsable_id AND u.universidad_id = h.universidad_id
          WHERE h.universidad_id = $1 AND h.asistencia_id = $2 ORDER BY h.fecha, h.id`,
        [contexto.universidadId, marca.id],
      )
      return cambios.map((h) => ({ ...h, fecha: h.fecha.toISOString() }))
    })
  }

  async propia(
    contexto: ContextoUniversidad,
    alumnoId: string,
    seccion: SeccionEspacio,
  ): Promise<AsistenciaPropia[]> {
    // Compatibilidad con ASI-04: listado solo, sin calcular agregados.
    return this.consultarPropia<AsistenciaPropia>(
      contexto,
      alumnoId,
      seccion,
      `SELECT clase, presente FROM (${MARCAS_PROPIAS}) propias ORDER BY fecha DESC, inicio DESC, id`,
    )
  }

  async resumenPropio(
    contexto: ContextoUniversidad,
    alumnoId: string,
    seccion: SeccionEspacio,
  ): Promise<ResumenAsistenciaPropia> {
    // Listado y conteo comparten snapshot. El conteo común no devuelve marcas
    // ajenas; el listado y los presentes siguen sujetos a la RLS del alumno.
    const [resumen] = await this.consultarPropia<ResumenAsistenciaPropia>(
      contexto,
      alumnoId,
      seccion,
      `WITH propias AS (${MARCAS_PROPIAS}), total AS (
         SELECT public.total_clases_asistencia($2) AS n
       )
       SELECT COALESCE((SELECT json_agg(json_build_object('clase', clase, 'presente', presente)
                ORDER BY fecha DESC, inicio DESC, id) FROM propias), '[]'::json) AS clases,
              t.n AS registradas,
              m.asistidas, t.n - m.marcadas AS "sinMarca",
              ${porcentajeAsistenciaSql('m.asistidas', 't.n')} AS porcentaje
         FROM total t CROSS JOIN (
           SELECT count(*)::int AS marcadas, count(*) FILTER (WHERE presente)::int AS asistidas FROM propias
         ) m`,
    )
    return resumen
  }

  private consultarPropia<T>(
    contexto: ContextoUniversidad,
    alumnoId: string,
    seccion: SeccionEspacio,
    sql: string,
  ): Promise<T[]> {
    if (contexto.rol !== 'ALUMNO' || seccion.rol !== 'ALUMNO')
      throw new ForbiddenException()
    return this.bd.enTransaccionEnUniversidad(contexto, async (bd) => {
      await bd.query(
        `SELECT set_config('app.asistencia_alumno_id', $1, true)`,
        [alumnoId],
      )
      return bd.query<T>(sql, [contexto.universidadId, seccion.id, alumnoId])
    })
  }

  // La clase debe ser de la sección y no estar archivada; si no, 404. El
  // Director la lee en cualquier universidad, en una transacción READ ONLY.
  async obtener(
    contexto: ContextoUniversidad,
    seccion: SeccionEspacio,
    claseId: string,
  ): Promise<AsistenciaClase> {
    const columnas = `${COLUMNAS_CLASE}, ${REGISTRO}, ${ALUMNOS_SECCION}`
    const [fila] =
      contexto.rol === 'DIRECTOR'
        ? await this.bd.consultarEnTodasLasUniversidades<FilaAsistencia>(
            contexto,
            `SELECT ${columnas} ${DESDE_CLASE}
              WHERE s.id = $1 AND c.id = $2 AND c.archived_at IS NULL`,
            [seccion.id, claseId],
          )
        : await this.bd.consultarEnUniversidad<FilaAsistencia>(
            contexto,
            `SELECT ${columnas} ${DESDE_CLASE}
              WHERE c.universidad_id = $1 AND s.id = $2 AND c.id = $3
                AND c.archived_at IS NULL`,
            [seccion.id, claseId],
          )
    if (!fila) {
      throw new NotFoundException('La clase no existe')
    }
    return respuesta(fila)
  }

  // Todo en una transacción: revalida la clase y al profesor (con la sección
  // y la clase fijadas), exige que la lista coincida con los alumnos activos
  // (con sus inscripciones fijadas: quitar a un alumno espera a que termine)
  // y guarda una fila por alumno. Una clase con asistencia responde 409:
  // corregir una marca es ASI-04.
  async guardar(
    contexto: ContextoUniversidad,
    usuarioId: string,
    seccion: SeccionEspacio,
    claseId: string,
    datos: GuardarAsistenciaDto,
  ): Promise<AsistenciaClase> {
    return this.bd.enTransaccionEnUniversidad(contexto, async (bd) => {
      const [fila] = await bd.query<FilaAsistencia & { es_profesor: boolean }>(
        `SELECT s.profesor_id = $4 AS es_profesor, ${COLUMNAS_CLASE},
                ${REGISTRO}, ${ALUMNOS_SECCION}
           ${DESDE_CLASE}
          WHERE c.universidad_id = $1 AND s.id = $2 AND c.id = $3
            AND c.archived_at IS NULL AND s.archived_at IS NULL
            AND cu.archived_at IS NULL
            FOR SHARE OF c, s`,
        [contexto.universidadId, seccion.id, claseId, usuarioId],
      )
      if (!fila) {
        throw new NotFoundException('La clase no existe')
      }
      if (!fila.es_profesor) {
        throw new ForbiddenException(
          'Solo el profesor de la sección registra la asistencia',
        )
      }
      if (fila.registrada) {
        throw new ConflictException(
          'La asistencia de esta clase ya está registrada; corregirla es otra acción',
        )
      }
      // Los alumnos activos se leen con sus inscripciones fijadas (FOR
      // SHARE): gestión no bloquea la sección, así que quitar a un alumno
      // (GES-19) espera a que esta transacción termine. Un alumno inscrito
      // después queda sin marca en esta clase.
      const inscritos = await bd.query<{ id: string }>(
        `SELECT i.usuario_id AS id FROM inscripcion i
          WHERE i.universidad_id = $1 AND i.seccion_id = $2
            AND i.archived_at IS NULL
            FOR SHARE`,
        [contexto.universidadId, seccion.id],
      )
      if (inscritos.length === 0) {
        throw new BadRequestException('La sección no tiene alumnos inscritos')
      }

      // Los UUID se comparan en minúsculas, como los devuelve PostgreSQL.
      const marcas = datos.marcas.map((m) => ({
        alumnoId: m.alumnoId.toLowerCase(),
        presente: m.presente,
      }))
      const enviados = marcas.map((m) => m.alumnoId)
      const activos = new Set(inscritos.map((a) => a.id))
      const recibidos = new Set(enviados)
      const error: ErrorListaAsistencia = {
        statusCode: 400,
        message:
          'La lista debe tener exactamente una marca por cada alumno inscrito',
        faltantes: [...activos].filter((id) => !recibidos.has(id)),
        sobrantes: [...recibidos].filter((id) => !activos.has(id)),
        repetidos: repetidos(enviados),
      }
      if (
        error.faltantes.length ||
        error.sobrantes.length ||
        error.repetidos.length
      ) {
        throw new BadRequestException(error)
      }

      try {
        await bd.query(
          `INSERT INTO asistencia (universidad_id, clase_id, alumno_id, presente, registrada_por)
           SELECT $1, $2, m."alumnoId", m.presente, $3
             FROM jsonb_to_recordset($4::jsonb) AS m("alumnoId" uuid, presente boolean)`,
          [contexto.universidadId, claseId, usuarioId, JSON.stringify(marcas)],
        )
      } catch (e) {
        const { code, constraint } = e as { code?: string; constraint?: string }
        // Otra petición la registró al mismo tiempo.
        if (code === UNIQUE && constraint === MARCA_UNICA) {
          throw new ConflictException(
            'La asistencia de esta clase ya está registrada; corregirla es otra acción',
          )
        }
        throw e
      }

      const [guardada] = await bd.query<FilaAsistencia>(
        `SELECT ${COLUMNAS_CLASE}, ${REGISTRO}, ${ALUMNOS_SECCION}
           ${DESDE_CLASE}
          WHERE c.universidad_id = $1 AND s.id = $2 AND c.id = $3`,
        [contexto.universidadId, seccion.id, claseId],
      )
      return respuesta(guardada)
    })
  }
}
