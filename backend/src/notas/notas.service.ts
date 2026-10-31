import {
  esNotaValida,
  type ErrorListaNotas,
  type GuardarNotas,
  type EstadoNota,
  type NotasEvaluacion,
  type SeccionEspacio,
} from '@cursus/shared'
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import {
  BaseDeDatos,
  type ContextoUniversidad,
} from '../database/base-de-datos.service.js'
import { AuditoriaNotasService } from './auditoria-notas.service.js'

// La evaluación se llama e en la consulta.
const COLUMNAS_EVALUACION = `json_build_object(
  'id', e.id, 'nombre', e.nombre, 'fecha', to_char(e.fecha, 'YYYY-MM-DD'),
  'ponderacion', e.ponderacion) AS evaluacion`

// Alumnos activos de la sección de la evaluación, por nombre en español y
// correo (como ALUMNOS_SECCION), con su nota activa en la evaluación. Sin
// correos: la lista la lee el ayudante (RE-10).
const ALUMNOS_CON_NOTA = `
  COALESCE((SELECT json_agg(json_build_object(
                     'id', u.id, 'nombre', u.nombre,
                     'nota', n.valor::float8, 'estado', n.estado)
                   ORDER BY u.nombre COLLATE "es-CL-x-icu", u.correo)
              FROM inscripcion i
              JOIN usuario u ON u.id = i.usuario_id
              LEFT JOIN nota n ON n.evaluacion_id = e.id
                              AND n.alumno_id = u.id AND n.archived_at IS NULL
             WHERE i.seccion_id = e.seccion_id AND i.archived_at IS NULL), '[]') AS alumnos`

const DESDE_EVALUACION = `
  FROM evaluacion e
  JOIN seccion s ON s.id = e.seccion_id
  JOIN curso cu ON cu.id = s.curso_id`

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

// NOT-05 (RN-10): notas de una evaluación de una sección que
// IntegranteSeccionGuard ya verificó. El controlador decide quién lee y
// quién guarda.
@Injectable()
export class NotasService {
  private readonly logger = new Logger(NotasService.name)

  constructor(
    private readonly bd: BaseDeDatos,
    private readonly auditoria: AuditoriaNotasService,
  ) {}

  // La evaluación debe ser de la sección y no estar archivada; si no, 404.
  // El Director la lee en cualquier universidad, en una transacción READ
  // ONLY.
  async obtener(
    contexto: ContextoUniversidad,
    seccion: SeccionEspacio,
    evaluacionId: string,
  ): Promise<NotasEvaluacion> {
    const columnas = `${COLUMNAS_EVALUACION}, ${ALUMNOS_CON_NOTA}`
    const [fila] =
      contexto.rol === 'DIRECTOR'
        ? await this.bd.consultarEnTodasLasUniversidades<NotasEvaluacion>(
            contexto,
            `SELECT ${columnas} ${DESDE_EVALUACION}
              WHERE s.id = $1 AND e.id = $2 AND e.archived_at IS NULL`,
            [seccion.id, evaluacionId],
          )
        : await this.bd.consultarEnUniversidad<NotasEvaluacion>(
            contexto,
            `SELECT ${columnas} ${DESDE_EVALUACION}
              WHERE e.universidad_id = $1 AND s.id = $2 AND e.id = $3
                AND e.archived_at IS NULL`,
            [seccion.id, evaluacionId],
          )
    if (!fila) {
      throw new NotFoundException('La evaluación no existe')
    }
    return fila
  }

  // Guarda como propuesta las notas recibidas, de cualquier subconjunto de
  // los alumnos activos; los que no vienen conservan la suya. El pipe del
  // controlador ya rechazó las notas fuera de la escala con su detalle por
  // alumno (NOT-06); se vuelve a revisar aquí por si se llama sin él. Cada
  // nota que cambia deja un evento PROPUESTA en nota_cambio (NOT-04), en la
  // misma transacción.
  async guardar(
    contexto: ContextoUniversidad,
    usuarioId: string,
    seccion: SeccionEspacio,
    evaluacionId: string,
    datos: GuardarNotas,
  ): Promise<NotasEvaluacion> {
    if (!datos.notas.every((n) => esNotaValida(n.nota))) {
      throw new BadRequestException('Nota inválida')
    }
    // Los UUID se comparan en minúsculas, como los devuelve PostgreSQL.
    const notas = datos.notas.map((n) => ({
      alumnoId: n.alumnoId.toLowerCase(),
      nota: n.nota,
    }))
    const dobles = repetidos(notas.map((n) => n.alumnoId))

    return this.bd.enTransaccionEnUniversidad(contexto, async (bd) => {
      // Un guardado a la vez por evaluación: así la nota anterior que queda
      // en la auditoría es la última guardada. Con un advisory lock y no con
      // FOR UPDATE, porque la RLS de evaluacion solo deja modificarla (y
      // bloquear sus filas) al profesor. La clave sigue el patrón de
      // horarios.service.ts; el id va en minúsculas porque ParseUUIDPipe
      // acepta mayúsculas y la clave se calcula sobre el texto.
      await bd.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
        `notas:${evaluacionId.toLowerCase()}`,
      ])
      const [evaluacion] = await bd.query<{
        id: string
        es_ayudante: boolean
      }>(
        `SELECT e.id,
                EXISTS (SELECT 1 FROM ayudante_seccion a
                          JOIN usuario u ON u.id = a.usuario_id
                         WHERE a.seccion_id = s.id AND a.usuario_id = $4
                           AND a.archived_at IS NULL AND u.rol = 'AYUDANTE'
                           AND u.archived_at IS NULL) AS es_ayudante
           ${DESDE_EVALUACION}
          WHERE e.universidad_id = $1 AND s.id = $2 AND e.id = $3
            AND e.archived_at IS NULL AND s.archived_at IS NULL
            AND cu.archived_at IS NULL`,
        [contexto.universidadId, seccion.id, evaluacionId, usuarioId],
      )
      if (!evaluacion) {
        throw new NotFoundException('La evaluación no existe')
      }
      // Se le quitó la sección después de que el guard la verificara.
      if (!evaluacion.es_ayudante) {
        throw new ForbiddenException(
          'Solo un ayudante de la sección ingresa notas',
        )
      }

      // Las inscripciones se leen fijadas (FOR SHARE), como en ASI-02: quitar
      // a un alumno (GES-19) espera a que termine este guardado.
      const inscritos = await bd.query<{ id: string }>(
        `SELECT i.usuario_id AS id FROM inscripcion i
          WHERE i.universidad_id = $1 AND i.seccion_id = $2
            AND i.archived_at IS NULL
            FOR SHARE`,
        [contexto.universidadId, seccion.id],
      )
      const activos = new Set(inscritos.map((a) => a.id))
      const sobrantes = [
        ...new Set(
          notas.map((n) => n.alumnoId).filter((id) => !activos.has(id)),
        ),
      ]
      if (sobrantes.length || dobles.length) {
        const error: ErrorListaNotas = {
          statusCode: 400,
          message:
            'Solo se ingresan notas de alumnos inscritos, una por alumno',
          sobrantes,
          repetidos: dobles,
        }
        throw new BadRequestException(error)
      }

      const actuales = await bd.query<{
        alumno_id: string
        valor: string
        estado: EstadoNota
      }>(
        `SELECT alumno_id, valor, estado FROM nota
          WHERE universidad_id = $1 AND evaluacion_id = $2
            AND archived_at IS NULL`,
        [contexto.universidadId, evaluacionId],
      )
      const anteriores = new Map(actuales.map((n) => [n.alumno_id, n]))
      // Publicar (NOT-11) y recorregir (NOT-15) son otras tarjetas. Se revisa
      // antes de escribir: si viene una nota publicada, no se guarda ninguna.
      const publicada = notas.some(({ alumnoId }) => {
        const estado = anteriores.get(alumnoId)?.estado
        return estado !== undefined && estado !== 'PROPUESTA'
      })
      if (publicada) {
        throw new BadRequestException(
          'Una nota publicada no se cambia desde aquí',
        )
      }

      for (const { alumnoId, nota } of notas) {
        const anterior = anteriores.get(alumnoId)
        const evento = await this.auditoria.registrar(bd, {
          universidadId: contexto.universidadId,
          evaluacionId,
          alumnoId,
          tipo: 'PROPUESTA',
          notaAnterior: anterior?.valor ?? null,
          notaNueva: nota,
          responsableId: usuarioId,
        })
        // registrar() no deja evento si la nota no cambió: tampoco se toca la
        // fila.
        if (evento === null) continue
        if (anterior) {
          // La RLS omite sin error una fila que no puede modificar: si el
          // UPDATE no la alcanza, se aborta (con el evento ya registrado) en
          // vez de responder 200 con la nota sin cambiar.
          const [{ filas }] = await bd.query<{ filas: number }>(
            `WITH modificada AS (
               UPDATE nota SET valor = $4, propuesta_por = $5
                WHERE universidad_id = $1 AND evaluacion_id = $2
                  AND alumno_id = $3 AND archived_at IS NULL
               RETURNING 1)
             SELECT count(*)::int AS filas FROM modificada`,
            [contexto.universidadId, evaluacionId, alumnoId, nota, usuarioId],
          )
          if (filas !== 1) {
            // Sin datos personales: el contexto basta para ubicar el caso.
            this.logger.error({
              mensaje: 'El UPDATE de una nota no modificó la fila',
              evaluacionId,
              seccionId: seccion.id,
              universidadId: contexto.universidadId,
              filas,
            })
            throw new InternalServerErrorException(
              'No se pudieron guardar las notas',
            )
          }
        } else {
          await bd.query(
            `INSERT INTO nota (universidad_id, evaluacion_id, alumno_id, valor, propuesta_por)
             VALUES ($1, $2, $3, $4, $5)`,
            [contexto.universidadId, evaluacionId, alumnoId, nota, usuarioId],
          )
        }
      }

      const [guardada] = await bd.query<NotasEvaluacion>(
        `SELECT ${COLUMNAS_EVALUACION}, ${ALUMNOS_CON_NOTA}
           ${DESDE_EVALUACION}
          WHERE e.universidad_id = $1 AND s.id = $2 AND e.id = $3`,
        [contexto.universidadId, seccion.id, evaluacionId],
      )
      return guardada
    })
  }
}
