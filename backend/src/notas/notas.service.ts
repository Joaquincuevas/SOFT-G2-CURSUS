import {
  esNotaValida,
  type ErrorListaNotas,
  type ErrorNotasFaltantes,
  type EstadoRevisionNotas,
  type GuardarNotas,
  type EstadoNota,
  type NotasEvaluacion,
  type SeccionEspacio,
} from '@cursus/shared'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import {
  BaseDeDatos,
  type ContextoUniversidad,
  fijarUsuario,
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

// NOT-07: estado de las notas frente al profesor. Una evaluación sin fila en
// revision_notas es un borrador.
const ESTADO_REVISION = `COALESCE(r.estado, 'BORRADOR') AS estado`
const CON_REVISION = `
  LEFT JOIN revision_notas r ON r.evaluacion_id = e.id`

// NOT-08: el ayudante escribe notas y envía solo en BORRADOR o DEVUELTA.
const NO_EDITABLE: Partial<Record<EstadoRevisionNotas, string>> = {
  EN_REVISION: 'Las notas están en revisión',
  APROBADA: 'Las notas ya fueron aprobadas',
}

// NOT-11: el profesor aprueba solo en EN_REVISION.
const NO_APROBABLE: Record<
  Exclude<EstadoRevisionNotas, 'EN_REVISION'>,
  string
> = {
  BORRADOR: 'Las notas aún no se envían a revisión',
  DEVUELTA: 'Las notas fueron devueltas al ayudante',
  APROBADA: 'Las notas ya fueron aprobadas',
}

type Consulta = Pick<BaseDeDatos, 'query'>

// Un guardado, envío o aprobación a la vez por evaluación (ver
// bloquearEvaluacionEditable).
const bloquearNotasDe = (bd: Consulta, evaluacionId: string) =>
  bd.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
    `notas:${evaluacionId.toLowerCase()}`,
  ])

// Dentro de la transacción de un guardado o un envío: toma el lock de la
// evaluación y comprueba que existe, que quien escribe sigue siendo ayudante
// de la sección y que las notas aún se editan (409 si no).
async function bloquearEvaluacionEditable(
  bd: Consulta,
  contexto: ContextoUniversidad,
  usuarioId: string,
  seccion: SeccionEspacio,
  evaluacionId: string,
): Promise<void> {
  // Un guardado o envío a la vez por evaluación: así la nota anterior que
  // queda en la auditoría es la última guardada, y un envío ve las notas
  // definitivas. Con un advisory lock y no con FOR UPDATE, porque la RLS de
  // evaluacion solo deja modificarla (y bloquear sus filas) al profesor. La
  // clave sigue el patrón de horarios.service.ts; el id va en minúsculas
  // porque ParseUUIDPipe acepta mayúsculas y la clave se calcula sobre el
  // texto.
  await bloquearNotasDe(bd, evaluacionId)
  const [evaluacion] = await bd.query<{
    es_ayudante: boolean
    estado: EstadoRevisionNotas
  }>(
    `SELECT ${ESTADO_REVISION},
            EXISTS (SELECT 1 FROM ayudante_seccion a
                      JOIN usuario u ON u.id = a.usuario_id
                     WHERE a.seccion_id = s.id AND a.usuario_id = $4
                       AND a.archived_at IS NULL AND u.rol = 'AYUDANTE'
                       AND u.archived_at IS NULL) AS es_ayudante
       ${DESDE_EVALUACION} ${CON_REVISION}
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
    throw new ForbiddenException('Solo un ayudante de la sección ingresa notas')
  }
  const bloqueo = NO_EDITABLE[evaluacion.estado]
  if (bloqueo) {
    throw new ConflictException(bloqueo)
  }
}

// Alumnos con inscripción activa en la sección, fijados (FOR SHARE) como en
// ASI-02: quitar a un alumno (GES-19) espera a que termine la transacción.
const inscritosFijados = (
  bd: Consulta,
  contexto: ContextoUniversidad,
  seccionId: string,
) =>
  bd.query<{ id: string }>(
    `SELECT i.usuario_id AS id FROM inscripcion i
      WHERE i.universidad_id = $1 AND i.seccion_id = $2
        AND i.archived_at IS NULL
        FOR SHARE`,
    [contexto.universidadId, seccionId],
  )

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
    const columnas = `${COLUMNAS_EVALUACION}, ${ESTADO_REVISION}, ${ALUMNOS_CON_NOTA}`
    const [fila] =
      contexto.rol === 'DIRECTOR'
        ? await this.bd.consultarEnTodasLasUniversidades<NotasEvaluacion>(
            contexto,
            `SELECT ${columnas} ${DESDE_EVALUACION} ${CON_REVISION}
              WHERE s.id = $1 AND e.id = $2 AND e.archived_at IS NULL`,
            [seccion.id, evaluacionId],
          )
        : await this.bd.consultarEnUniversidad<NotasEvaluacion>(
            contexto,
            `SELECT ${columnas} ${DESDE_EVALUACION} ${CON_REVISION}
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
  // alumno (NOT-06). Esta revisión no sobra: el servicio no confía en quien
  // lo llama, y es la última barrera antes de la base si un cuerpo llega sin
  // pasar por el pipe. Cada nota que cambia deja un evento PROPUESTA en
  // nota_cambio (NOT-04), en la misma transacción.
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
      // NOT-08: una evaluación enviada a revisión o aprobada no se edita.
      await bloquearEvaluacionEditable(
        bd,
        contexto,
        usuarioId,
        seccion,
        evaluacionId,
      )
      const inscritos = await inscritosFijados(bd, contexto, seccion.id)
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

      // NOT-07: el primer guardado deja la evaluación en borrador, que el
      // profesor no ve como pendiente. Sin evento: no es una transición. El
      // advisory lock ya serializa los guardados; ON CONFLICT cubre igual una
      // fila creada por otra vía.
      await bd.query(
        `INSERT INTO revision_notas (universidad_id, evaluacion_id, actualizado_por)
         VALUES ($1, $2, $3)
         ON CONFLICT (evaluacion_id) DO NOTHING`,
        [contexto.universidadId, evaluacionId, usuarioId],
      )

      const [guardada] = await bd.query<NotasEvaluacion>(
        `SELECT ${COLUMNAS_EVALUACION}, ${ESTADO_REVISION}, ${ALUMNOS_CON_NOTA}
           ${DESDE_EVALUACION} ${CON_REVISION}
          WHERE e.universidad_id = $1 AND s.id = $2 AND e.id = $3`,
        [contexto.universidadId, seccion.id, evaluacionId],
      )
      return guardada
    })
  }

  // NOT-08: envía a revisión las notas de la evaluación. Exige una nota
  // válida para cada alumno con inscripción activa en este momento (400 con
  // los que faltan), pasa revision_notas de BORRADOR o DEVUELTA a EN_REVISION
  // y deja un evento ENVIO, todo en la misma transacción y con el lock de la
  // evaluación: un guardado o un segundo envío esperan, y el segundo envío
  // responde 409.
  async enviar(
    contexto: ContextoUniversidad,
    usuarioId: string,
    seccion: SeccionEspacio,
    evaluacionId: string,
  ): Promise<NotasEvaluacion> {
    return this.bd.enTransaccionEnUniversidad(contexto, async (bd) => {
      await bloquearEvaluacionEditable(
        bd,
        contexto,
        usuarioId,
        seccion,
        evaluacionId,
      )
      const inscritos = await inscritosFijados(bd, contexto, seccion.id)
      if (inscritos.length === 0) {
        throw new BadRequestException('La sección no tiene alumnos inscritos')
      }
      const notas = await bd.query<{ alumno_id: string; valor: string }>(
        `SELECT alumno_id, valor FROM nota
          WHERE universidad_id = $1 AND evaluacion_id = $2
            AND archived_at IS NULL`,
        [contexto.universidadId, evaluacionId],
      )
      // valor llega como texto (numeric): una nota guardada siempre cumple la
      // escala, pero se vuelve a revisar antes de enviarla.
      const conNota = new Set(
        notas
          .filter((n) => esNotaValida(Number(n.valor)))
          .map((n) => n.alumno_id),
      )
      const faltantes = inscritos
        .map((a) => a.id)
        .filter((id) => !conNota.has(id))
      if (faltantes.length) {
        const error: ErrorNotasFaltantes = {
          statusCode: 400,
          message: 'Faltan notas',
          faltantes,
        }
        throw new BadRequestException(error)
      }

      // Una evaluación cuyas notas no pasaron por el PUT aún no tiene fila.
      await bd.query(
        `INSERT INTO revision_notas (universidad_id, evaluacion_id, actualizado_por)
         VALUES ($1, $2, $3)
         ON CONFLICT (evaluacion_id) DO NOTHING`,
        [contexto.universidadId, evaluacionId, usuarioId],
      )
      // La RLS solo deja al ayudante pasar de BORRADOR o DEVUELTA a
      // EN_REVISION, y omite sin error una fila que no alcanza: si el UPDATE
      // no la modifica, se aborta en vez de responder 200 sin enviar.
      const [{ filas }] = await bd.query<{ filas: number }>(
        `WITH enviada AS (
           UPDATE revision_notas SET estado = 'EN_REVISION', actualizado_por = $3
            WHERE universidad_id = $1 AND evaluacion_id = $2
              AND estado IN ('BORRADOR', 'DEVUELTA')
           RETURNING 1)
         SELECT count(*)::int AS filas FROM enviada`,
        [contexto.universidadId, evaluacionId, usuarioId],
      )
      if (filas !== 1) {
        this.logger.error({
          mensaje: 'El UPDATE del envío no modificó revision_notas',
          evaluacionId,
          seccionId: seccion.id,
          universidadId: contexto.universidadId,
          filas,
        })
        throw new InternalServerErrorException(
          'No se pudieron enviar las notas',
        )
      }
      await this.auditoria.registrar(bd, {
        universidadId: contexto.universidadId,
        evaluacionId,
        tipo: 'ENVIO',
        responsableId: usuarioId,
      })

      const [enviada] = await bd.query<NotasEvaluacion>(
        `SELECT ${COLUMNAS_EVALUACION}, ${ESTADO_REVISION}, ${ALUMNOS_CON_NOTA}
           ${DESDE_EVALUACION} ${CON_REVISION}
          WHERE e.universidad_id = $1 AND s.id = $2 AND e.id = $3`,
        [contexto.universidadId, seccion.id, evaluacionId],
      )
      return enviada
    })
  }

  // NOT-11: el profesor de la sección aprueba las notas en revisión y las
  // publica. Con el lock de la evaluación y en una transacción: cada nota
  // PROPUESTA pasa a PUBLICADA con su evento PUBLICACION, y la revisión a
  // APROBADA con un evento APROBACION. Una segunda aprobación espera el lock
  // y responde 409. La RLS (usuario_actual()) exige lo mismo sin el servicio.
  async aprobar(
    contexto: ContextoUniversidad,
    usuarioId: string,
    seccion: SeccionEspacio,
    evaluacionId: string,
  ): Promise<NotasEvaluacion> {
    return this.bd.enTransaccionEnUniversidad(contexto, async (bd) => {
      await fijarUsuario(bd, usuarioId)
      await bloquearNotasDe(bd, evaluacionId)
      const [evaluacion] = await bd.query<{
        es_profesor: boolean
        estado: EstadoRevisionNotas
      }>(
        `SELECT ${ESTADO_REVISION}, s.profesor_id = $4 AS es_profesor
           ${DESDE_EVALUACION} ${CON_REVISION}
          WHERE e.universidad_id = $1 AND s.id = $2 AND e.id = $3
            AND e.archived_at IS NULL AND s.archived_at IS NULL
            AND cu.archived_at IS NULL`,
        [contexto.universidadId, seccion.id, evaluacionId, usuarioId],
      )
      if (!evaluacion) {
        throw new NotFoundException('La evaluación no existe')
      }
      // Se le quitó la sección después de que el guard la verificara.
      if (!evaluacion.es_profesor) {
        throw new ForbiddenException(
          'Solo el profesor de la sección aprueba las notas',
        )
      }
      if (evaluacion.estado !== 'EN_REVISION') {
        throw new ConflictException(NO_APROBABLE[evaluacion.estado])
      }

      // En revisión, toda nota activa es una propuesta en la escala: el
      // ayudante no publica y ck_nota_valor fija el rango. Se revisa igual
      // antes de publicar, y la RLS lo vuelve a exigir en el UPDATE.
      const [{ invalidas }] = await bd.query<{ invalidas: number }>(
        `SELECT count(*)::int AS invalidas FROM nota
          WHERE universidad_id = $1 AND evaluacion_id = $2
            AND archived_at IS NULL
            AND (estado <> 'PROPUESTA' OR valor NOT BETWEEN 1.0 AND 7.0)`,
        [contexto.universidadId, evaluacionId],
      )
      if (invalidas > 0) {
        throw new ConflictException(
          'Hay notas que no están propuestas en la escala de 1,0 a 7,0',
        )
      }
      const publicadas = await bd.query<{ alumno_id: string; valor: string }>(
        `WITH publicadas AS (
           UPDATE nota SET estado = 'PUBLICADA'
            WHERE universidad_id = $1 AND evaluacion_id = $2
              AND archived_at IS NULL AND estado = 'PROPUESTA'
           RETURNING alumno_id, valor)
         SELECT alumno_id, valor FROM publicadas ORDER BY alumno_id`,
        [contexto.universidadId, evaluacionId],
      )
      if (publicadas.length === 0) {
        throw new ConflictException('La evaluación no tiene notas que publicar')
      }
      // Como en el envío: si la RLS omite la fila, se aborta todo.
      const [{ filas }] = await bd.query<{ filas: number }>(
        `WITH aprobada AS (
           UPDATE revision_notas SET estado = 'APROBADA', actualizado_por = $3
            WHERE universidad_id = $1 AND evaluacion_id = $2
              AND estado = 'EN_REVISION'
           RETURNING 1)
         SELECT count(*)::int AS filas FROM aprobada`,
        [contexto.universidadId, evaluacionId, usuarioId],
      )
      if (filas !== 1) {
        this.logger.error({
          mensaje: 'El UPDATE de la aprobación no modificó revision_notas',
          evaluacionId,
          seccionId: seccion.id,
          universidadId: contexto.universidadId,
          filas,
        })
        throw new InternalServerErrorException(
          'No se pudieron aprobar las notas',
        )
      }
      for (const nota of publicadas) {
        await this.auditoria.registrar(bd, {
          universidadId: contexto.universidadId,
          evaluacionId,
          alumnoId: nota.alumno_id,
          tipo: 'PUBLICACION',
          notaNueva: nota.valor,
          responsableId: usuarioId,
        })
      }
      await this.auditoria.registrar(bd, {
        universidadId: contexto.universidadId,
        evaluacionId,
        tipo: 'APROBACION',
        responsableId: usuarioId,
      })

      const [aprobada] = await bd.query<NotasEvaluacion>(
        `SELECT ${COLUMNAS_EVALUACION}, ${ESTADO_REVISION}, ${ALUMNOS_CON_NOTA}
           ${DESDE_EVALUACION} ${CON_REVISION}
          WHERE e.universidad_id = $1 AND s.id = $2 AND e.id = $3`,
        [contexto.universidadId, seccion.id, evaluacionId],
      )
      return aprobada
    })
  }
}
