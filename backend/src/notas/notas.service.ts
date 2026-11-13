import {
  esNotaValida,
  type ErrorListaNotas,
  type DevolverNotas,
  type ErrorEstadoRevision,
  type ErrorNotasFaltantes,
  type EstadoRevisionNotas,
  type GuardarNotas,
  type HistorialNota,
  type EstadoNota,
  type NotasEvaluacion,
  type SeccionEspacio,
  type RecorregirNota,
  type ErrorNotaRecorregida,
  LARGO_MOTIVO_NOTA,
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
import { exigirCursoAbierto } from '../database/curso-abierto.js'
import { AuditoriaNotasService } from './auditoria-notas.service.js'
import { bloquearNotasDe } from './bloqueo-notas.js'
import {
  COMENTARIO_DEVOLUCION_NOTAS,
  ESTADO_REVISION_NOTAS,
} from './revision-notas.sql.js'

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
                     'nota', n.valor::float8, 'estado', n.estado,
                     'recorregida', n.recorreccion_id IS NOT NULL)
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
const ESTADO_REVISION = `${ESTADO_REVISION_NOTAS} AS estado`
const CON_REVISION = `
  LEFT JOIN revision_notas r ON r.evaluacion_id = e.id`

// NOT-09: el comentario acompaña a todas las respuestas del detalle,
// también al guardar y reenviar, para no conservar una devolución anterior.
const COLUMNAS_NOTAS = `${COLUMNAS_EVALUACION}, ${ESTADO_REVISION},
  ${COMENTARIO_DEVOLUCION_NOTAS} AS "comentarioDevolucion", ${ALUMNOS_CON_NOTA}`

// NOT-08: el ayudante escribe notas y envía solo en BORRADOR o DEVUELTA.
const NO_EDITABLE: Partial<Record<EstadoRevisionNotas, string>> = {
  EN_REVISION: 'Las notas están en revisión',
  APROBADA: 'Las notas ya fueron aprobadas',
}

// NOT-11 y NOT-12: el profesor aprueba o devuelve solo en EN_REVISION.
const FUERA_DE_REVISION: Record<
  Exclude<EstadoRevisionNotas, 'EN_REVISION'>,
  string
> = {
  BORRADOR: 'Las notas aún no se envían a revisión',
  DEVUELTA: 'Las notas fueron devueltas al ayudante',
  APROBADA: 'Las notas ya fueron aprobadas',
}

type Consulta = Pick<BaseDeDatos, 'query'>

// NOT-11 y NOT-12: dentro de la transacción de una aprobación o una
// devolución. Fija el usuario para la RLS (usuario_actual()), toma el lock de
// la evaluación y comprueba que existe (404), que quien revisa sigue siendo
// el profesor de la sección (403) y que está EN_REVISION (409 con el estado).
async function bloquearEvaluacionEnRevision(
  bd: Consulta,
  contexto: ContextoUniversidad,
  usuarioId: string,
  seccion: SeccionEspacio,
  evaluacionId: string,
  soloElProfesor: string,
): Promise<void> {
  await fijarUsuario(bd, usuarioId)
  await bloquearNotasDe(bd, evaluacionId)
  const [evaluacion] = await bd.query<{
    es_profesor: boolean
    estado: EstadoRevisionNotas
  }>(
    `SELECT ${ESTADO_REVISION}, es_profesor_de_seccion(s.id, $4) AS es_profesor
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
    throw new ForbiddenException(soloElProfesor)
  }
  if (evaluacion.estado !== 'EN_REVISION') {
    const error: ErrorEstadoRevision = {
      statusCode: 409,
      message: FUERA_DE_REVISION[evaluacion.estado],
      estado: evaluacion.estado,
    }
    throw new ConflictException(error)
  }
}

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

  // NOT-15: el profesor corrige una nota publicada sin perder su valor
  // anterior. El mismo lock de la evaluación serializa las escrituras.
  async recorregir(
    contexto: ContextoUniversidad,
    usuarioId: string,
    seccion: SeccionEspacio,
    evaluacionId: string,
    alumnoId: string,
    datos: RecorregirNota,
  ): Promise<NotasEvaluacion> {
    if (contexto.rol !== 'PROFESOR' || seccion.rol !== 'PROFESOR') {
      throw new ForbiddenException(
        'Solo el profesor de la sección registra recorrecciones',
      )
    }
    const motivo = typeof datos.motivo === 'string' ? datos.motivo.trim() : ''
    if (!esNotaValida(datos.notaAnterior) || !esNotaValida(datos.notaNueva)) {
      throw new BadRequestException(
        'Nota inválida: usa la escala de 1,0 a 7,0 con un decimal',
      )
    }
    if (
      !motivo ||
      [...motivo].length > LARGO_MOTIVO_NOTA ||
      !/^(?:[\t\n\r]|\P{Cc})*$/u.test(motivo)
    ) {
      throw new BadRequestException(
        `El motivo es obligatorio y admite hasta ${LARGO_MOTIVO_NOTA} caracteres`,
      )
    }
    return this.bd.enTransaccionEnUniversidad(contexto, async (bd) => {
      await exigirCursoAbierto(bd, seccion.id)
      await fijarUsuario(bd, usuarioId)
      await bloquearNotasDe(bd, evaluacionId)
      // Fija la sección para que una reasignación del profesor espere al
      // término de la recorrección, y vuelve a comprobar su pertenencia.
      const [evaluacion] = await bd.query<{ esProfesor: boolean }>(
        `SELECT es_profesor_de_seccion(s.id, $4) AS "esProfesor"
           FROM evaluacion e
           JOIN seccion s ON s.id = e.seccion_id AND s.universidad_id = e.universidad_id
           JOIN curso c ON c.id = s.curso_id AND c.universidad_id = s.universidad_id
          WHERE e.universidad_id = $1 AND s.id = $2 AND e.id = $3
            AND e.archived_at IS NULL AND s.archived_at IS NULL AND c.archived_at IS NULL
          FOR SHARE OF e, s, c`,
        [contexto.universidadId, seccion.id, evaluacionId, usuarioId],
      )
      if (!evaluacion) throw new NotFoundException('La evaluación no existe')
      if (!evaluacion.esProfesor) {
        throw new ForbiddenException(
          'Solo el profesor de la sección registra recorrecciones',
        )
      }
      const [actual] = await bd.query<{ valor: string; estado: EstadoNota }>(
        `SELECT n.valor, n.estado FROM nota n
          JOIN inscripcion i ON i.usuario_id = n.alumno_id
            AND i.universidad_id = n.universidad_id AND i.seccion_id = $2
          JOIN usuario u ON u.id = i.usuario_id AND u.universidad_id = i.universidad_id
         WHERE n.universidad_id = $1 AND n.evaluacion_id = $3 AND n.alumno_id = $4
           AND n.archived_at IS NULL AND i.archived_at IS NULL AND u.archived_at IS NULL
         FOR SHARE OF i`,
        [contexto.universidadId, seccion.id, evaluacionId, alumnoId],
      )
      if (!actual) throw new NotFoundException('La nota no existe')
      if (actual.estado !== 'PUBLICADA') {
        throw new ConflictException(
          'Solo se pueden recorregir notas publicadas',
        )
      }
      const notaActual = Number(actual.valor)
      if (notaActual !== datos.notaAnterior) {
        const error: ErrorNotaRecorregida = {
          statusCode: 409,
          message:
            'La nota cambió desde que abriste el formulario. Recarga las notas antes de corregirla.',
          notaActual,
        }
        throw new ConflictException(error)
      }
      if (notaActual === datos.notaNueva) {
        throw new BadRequestException(
          'La nota nueva debe ser distinta de la publicada',
        )
      }
      const eventoId = await this.auditoria.registrar(bd, {
        universidadId: contexto.universidadId,
        evaluacionId,
        alumnoId,
        tipo: 'RECORRECCION',
        notaAnterior: actual.valor,
        notaNueva: datos.notaNueva,
        motivo,
        responsableId: usuarioId,
      })
      const [{ filas }] = await bd.query<{ filas: number }>(
        `WITH corregida AS (
           UPDATE nota SET valor = $4, recorreccion_id = $5
            WHERE universidad_id = $1 AND evaluacion_id = $2 AND alumno_id = $3
              AND estado = 'PUBLICADA' AND archived_at IS NULL AND valor = $6
           RETURNING 1)
         SELECT count(*)::int AS filas FROM corregida`,
        [
          contexto.universidadId,
          evaluacionId,
          alumnoId,
          datos.notaNueva,
          eventoId,
          notaActual,
        ],
      )
      if (filas !== 1) {
        throw new ConflictException(
          'La nota ya no se puede recorregir. Recarga las notas.',
        )
      }
      const [corregida] = await bd.query<NotasEvaluacion>(
        `SELECT ${COLUMNAS_NOTAS} ${DESDE_EVALUACION} ${CON_REVISION}
          WHERE e.universidad_id = $1 AND s.id = $2 AND e.id = $3`,
        [contexto.universidadId, seccion.id, evaluacionId],
      )
      return corregida
    })
  }

  // La evaluación debe ser de la sección y no estar archivada; si no, 404.
  // El Director la lee en cualquier universidad, en una transacción READ
  // ONLY.
  async obtener(
    contexto: ContextoUniversidad,
    seccion: SeccionEspacio,
    evaluacionId: string,
  ): Promise<NotasEvaluacion> {
    const [fila] =
      contexto.rol === 'DIRECTOR'
        ? await this.bd.consultarEnTodasLasUniversidades<NotasEvaluacion>(
            contexto,
            `SELECT ${COLUMNAS_NOTAS} ${DESDE_EVALUACION} ${CON_REVISION}
              WHERE s.id = $1 AND e.id = $2 AND e.archived_at IS NULL`,
            [seccion.id, evaluacionId],
          )
        : await this.bd.consultarEnUniversidad<NotasEvaluacion>(
            contexto,
            `SELECT ${COLUMNAS_NOTAS}, public.curso_cerrado(s.curso_id) AS "cursoCerrado"
               ${DESDE_EVALUACION} ${CON_REVISION}
              WHERE e.universidad_id = $1 AND s.id = $2 AND e.id = $3
                AND e.archived_at IS NULL`,
            [seccion.id, evaluacionId],
          )
    if (!fila) {
      throw new NotFoundException('La evaluación no existe')
    }
    const { cursoCerrado, ...notas } = fila
    return { ...notas, ...(cursoCerrado && { cursoCerrado }) }
  }

  async historial(
    contexto: ContextoUniversidad,
    usuarioId: string,
    seccion: SeccionEspacio,
    evaluacionId: string,
    alumnoId: string,
  ): Promise<HistorialNota> {
    if (contexto.rol !== 'PROFESOR' || seccion.rol !== 'PROFESOR') {
      throw new ForbiddenException(
        'Solo un profesor vigente de la sección puede ver el historial',
      )
    }

    // La autorización y los eventos se leen en la misma instantánea.
    // Una nota aún sin eventos tiene historial vacío, aunque la evaluación
    // ya haya tenido envíos o devoluciones de otros alumnos.
    const [fila] = await this.bd.consultarEnUniversidad<
      HistorialNota & { autorizado: boolean; inscrito: boolean }
    >(
      contexto,
      `WITH alcance AS (
        SELECT e.id, e.universidad_id,
               es_profesor_de_seccion(s.id, $4) AS autorizado,
               EXISTS (
                 SELECT 1 FROM inscripcion i
                  WHERE i.universidad_id = e.universidad_id AND i.seccion_id = s.id
                    AND i.usuario_id = $5 AND i.archived_at IS NULL
               ) AS inscrito
          FROM evaluacion e
          JOIN seccion s ON s.id = e.seccion_id AND s.universidad_id = e.universidad_id
          JOIN curso cu ON cu.id = s.curso_id AND cu.universidad_id = s.universidad_id
         WHERE e.universidad_id = $1 AND s.id = $2 AND e.id = $3
           AND e.archived_at IS NULL AND s.archived_at IS NULL AND cu.archived_at IS NULL
      )
      SELECT a.autorizado, a.inscrito,
             COALESCE((
               SELECT json_agg(json_build_object(
                 'id', c.id, 'tipo', c.tipo, 'fecha', c.fecha,
                 'responsable', json_build_object('id', u.id, 'nombre', u.nombre),
                 'notaAnterior', c.nota_anterior, 'notaNueva', c.nota_nueva,
                 'motivo', c.motivo
               ) ORDER BY c.fecha, c.id)
                 FROM nota_cambio c
                 JOIN usuario u ON u.id = c.responsable_id AND u.universidad_id = c.universidad_id
                WHERE a.autorizado AND a.inscrito AND c.universidad_id = a.universidad_id
                  AND c.evaluacion_id = a.id
                  AND (c.alumno_id = $5 OR (c.alumno_id IS NULL AND EXISTS (
                    SELECT 1 FROM nota_cambio propia
                     WHERE propia.universidad_id = a.universidad_id
                       AND propia.evaluacion_id = a.id AND propia.alumno_id = $5
                  )))
             ), '[]') AS eventos
        FROM alcance a`,
      [seccion.id, evaluacionId, usuarioId, alumnoId],
    )
    if (!fila) throw new NotFoundException('La evaluación no existe')
    if (!fila.autorizado) throw new ForbiddenException()
    if (!fila.inscrito) {
      throw new NotFoundException('El alumno no está inscrito en esta sección')
    }
    return { eventos: fila.eventos }
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
      await exigirCursoAbierto(bd, seccion.id)
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
        `SELECT ${COLUMNAS_NOTAS}
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
      await exigirCursoAbierto(bd, seccion.id)
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
        `SELECT ${COLUMNAS_NOTAS}
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
      await exigirCursoAbierto(bd, seccion.id)
      await bloquearEvaluacionEnRevision(
        bd,
        contexto,
        usuarioId,
        seccion,
        evaluacionId,
        'Solo el profesor de la sección aprueba las notas',
      )

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
        `SELECT ${COLUMNAS_NOTAS}
           ${DESDE_EVALUACION} ${CON_REVISION}
          WHERE e.universidad_id = $1 AND s.id = $2 AND e.id = $3`,
        [contexto.universidadId, seccion.id, evaluacionId],
      )
      return aprobada
    })
  }

  // NOT-12: el profesor de la sección devuelve al ayudante las notas en
  // revisión, con un comentario. Con el lock de la evaluación y en una
  // transacción: la revisión pasa a DEVUELTA con el comentario y queda un
  // evento DEVOLUCION con el comentario como motivo. Las notas siguen en
  // PROPUESTA y el ayudante vuelve a editarlas y enviarlas (NOT-05 y NOT-08).
  // Una aprobación o devolución a la vez espera el lock y responde 409.
  async devolver(
    contexto: ContextoUniversidad,
    usuarioId: string,
    seccion: SeccionEspacio,
    evaluacionId: string,
    { comentario }: DevolverNotas,
  ): Promise<NotasEvaluacion> {
    return this.bd.enTransaccionEnUniversidad(contexto, async (bd) => {
      await exigirCursoAbierto(bd, seccion.id)
      await bloquearEvaluacionEnRevision(
        bd,
        contexto,
        usuarioId,
        seccion,
        evaluacionId,
        'Solo el profesor de la sección devuelve las notas',
      )
      // Como en el envío: si la RLS omite la fila, se aborta todo.
      const [{ filas }] = await bd.query<{ filas: number }>(
        `WITH devuelta AS (
           UPDATE revision_notas
              SET estado = 'DEVUELTA', actualizado_por = $3,
                  comentario_devolucion = $4
            WHERE universidad_id = $1 AND evaluacion_id = $2
              AND estado = 'EN_REVISION'
           RETURNING 1)
         SELECT count(*)::int AS filas FROM devuelta`,
        [contexto.universidadId, evaluacionId, usuarioId, comentario],
      )
      if (filas !== 1) {
        this.logger.error({
          mensaje: 'El UPDATE de la devolución no modificó revision_notas',
          evaluacionId,
          seccionId: seccion.id,
          universidadId: contexto.universidadId,
          filas,
        })
        throw new InternalServerErrorException(
          'No se pudieron devolver las notas',
        )
      }
      await this.auditoria.registrar(bd, {
        universidadId: contexto.universidadId,
        evaluacionId,
        tipo: 'DEVOLUCION',
        motivo: comentario,
        responsableId: usuarioId,
      })

      const [devuelta] = await bd.query<NotasEvaluacion>(
        `SELECT ${COLUMNAS_NOTAS}
           ${DESDE_EVALUACION} ${CON_REVISION}
          WHERE e.universidad_id = $1 AND s.id = $2 AND e.id = $3`,
        [contexto.universidadId, seccion.id, evaluacionId],
      )
      return devuelta
    })
  }
}
