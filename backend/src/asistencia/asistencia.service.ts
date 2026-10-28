import type {
  AsistenciaClase,
  ErrorListaAsistencia,
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
     FROM asistencia a JOIN usuario u ON u.id = a.alumno_id
    WHERE a.clase_id = c.id AND a.archived_at IS NULL) AS marcas,
  (SELECT json_build_object(
            'por', json_build_object('id', r.id, 'nombre', r.nombre),
            'en', a.created_at)
     FROM asistencia a JOIN usuario r ON r.id = a.registrada_por
    WHERE a.clase_id = c.id AND a.archived_at IS NULL
    ORDER BY a.created_at, a.id LIMIT 1) AS registrada`

const DESDE_CLASE = `
  FROM clase c
  JOIN seccion s ON s.id = c.seccion_id
  JOIN curso cu ON cu.id = s.curso_id`

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
