import type {
  PendienteRevision,
  SeccionAlumno,
  SeccionAyudante,
  SeccionDashboard,
} from '@cursus/shared'
import { ForbiddenException, Injectable } from '@nestjs/common'
import {
  BaseDeDatos,
  type ContextoUniversidad,
} from '../database/base-de-datos.service.js'
import { BLOQUES_HORARIO } from '../gestion/horarios.sql.js'
import { anuncioPendiente, anunciosVisibles } from '../anuncios/anuncios.sql.js'
import {
  EN_REVISION_DE_SECCION,
  SECCIONES_DEL_PROFESOR,
} from './pendientes.sql.js'

interface FilaSeccion {
  id: string
  numero: number
  curso_id: string
  codigo: string
  curso_nombre: string
  horario: SeccionDashboard['horario']
  alumnos: number
  pendientes_revision: number
}

interface FilaSeccionAyudante {
  id: string
  numero: number
  curso_id: string
  codigo: string
  curso_nombre: string
  profesor_id: string | null
  profesor_nombre: string | null
}

@Injectable()
export class DashboardService {
  constructor(private readonly bd: BaseDeDatos) {}

  // ESP-03: el usuario y la universidad provienen de la sesión, no del cliente.
  async seccionesAlumno(
    contexto: ContextoUniversidad,
    usuarioId: string,
  ): Promise<SeccionAlumno[]> {
    if (contexto.rol !== 'ALUMNO') return []
    return this.bd.consultarEnUniversidad<SeccionAlumno>(
      contexto,
      `SELECT s.id, s.numero,
              json_build_object('id', c.id, 'codigo', c.codigo, 'nombre', c.nombre) AS curso,
              ${BLOQUES_HORARIO} AS horario,
              CASE WHEN pr.id IS NULL THEN NULL
                ELSE json_build_object('id', pr.id, 'nombre', pr.nombre) END AS profesor,
              (SELECT count(*)::int FROM anuncio a
                WHERE ${anunciosVisibles('c.id', 's.id')}
                  AND ${anuncioPendiente('$2')}) AS "anunciosNuevos"
       FROM inscripcion i
       JOIN seccion s ON s.id = i.seccion_id AND s.universidad_id = i.universidad_id
       JOIN curso c ON c.id = s.curso_id AND c.universidad_id = s.universidad_id
       JOIN periodo p ON p.id = c.periodo_id AND p.universidad_id = c.universidad_id
       LEFT JOIN usuario pr ON pr.id = s.profesor_id AND pr.universidad_id = s.universidad_id
         AND pr.archived_at IS NULL AND pr.rol = 'PROFESOR'
       WHERE i.universidad_id = $1 AND i.usuario_id = $2 AND p.activo
         AND i.archived_at IS NULL AND s.archived_at IS NULL AND c.archived_at IS NULL
       ORDER BY c.codigo, s.numero, s.id`,
      [usuarioId],
    )
  }

  // ESP-01: secciones vigentes a cargo del profesor ($2) en el período activo
  // de su universidad, por código de curso y número. Sin período activo, o
  // para otro rol, la lista queda vacía (ESP-02 y ESP-03 agregan las del
  // ayudante y el alumno).
  async misSecciones(
    contexto: ContextoUniversidad,
    usuarioId: string,
  ): Promise<SeccionDashboard[]> {
    if (contexto.rol !== 'PROFESOR') {
      return []
    }
    const filas = await this.bd.consultarEnUniversidad<FilaSeccion>(
      contexto,
      `WITH s AS (${SECCIONES_DEL_PROFESOR})
       SELECT s.id, s.numero, s.curso_id, s.codigo, s.curso_nombre,
              ${BLOQUES_HORARIO} AS horario,
              (SELECT count(*)::int FROM inscripcion i
                WHERE i.seccion_id = s.id AND i.archived_at IS NULL) AS alumnos,
              (SELECT count(*)::int ${EN_REVISION_DE_SECCION}) AS pendientes_revision
         FROM s
        ORDER BY s.codigo, s.numero`,
      [usuarioId],
    )
    return filas.map((fila) => ({
      id: fila.id,
      numero: fila.numero,
      curso: {
        id: fila.curso_id,
        codigo: fila.codigo,
        nombre: fila.curso_nombre,
      },
      horario: fila.horario,
      alumnos: fila.alumnos,
      pendientesRevision: fila.pendientes_revision,
    }))
  }

  // NOT-10: evaluaciones en revisión de las secciones del profesor ($2), con
  // el último envío (el ayudante y la fecha salen de nota_cambio, que no se
  // reescribe: tras una devolución y un reenvío vale el último ENVIO), de la
  // más antigua a la más nueva. Mismo filtro que el contador de misSecciones.
  // Solo el profesor: el Director no tiene secciones a cargo.
  async pendientesRevision(
    contexto: ContextoUniversidad,
    usuarioId: string,
  ): Promise<PendienteRevision[]> {
    if (contexto.rol !== 'PROFESOR') {
      throw new ForbiddenException(
        'Solo el profesor ve las evaluaciones pendientes de revisión',
      )
    }
    const filas = await this.bd.consultarEnUniversidad<
      Omit<PendienteRevision, 'enviadaEl'> & { enviadaEl: Date | null }
    >(
      contexto,
      `WITH s AS (${SECCIONES_DEL_PROFESOR})
       SELECT json_build_object('id', e.id, 'nombre', e.nombre,
                'fecha', to_char(e.fecha, 'YYYY-MM-DD')) AS evaluacion,
              json_build_object('id', s.id, 'numero', s.numero) AS seccion,
              json_build_object('id', s.curso_id, 'codigo', s.codigo,
                'nombre', s.curso_nombre) AS curso,
              CASE WHEN u.id IS NULL THEN NULL
                ELSE json_build_object('id', u.id, 'nombre', u.nombre) END AS ayudante,
              envio.fecha AS "enviadaEl",
              (SELECT count(*)::int FROM inscripcion i
                WHERE i.seccion_id = s.id AND i.archived_at IS NULL
                  AND NOT EXISTS (SELECT 1 FROM nota n
                                   WHERE n.evaluacion_id = e.id
                                     AND n.alumno_id = i.usuario_id
                                     AND n.archived_at IS NULL)) AS "sinNota"
         FROM s
        CROSS JOIN LATERAL (SELECT e.id, e.nombre, e.fecha ${EN_REVISION_DE_SECCION}) e
         -- alumno_id IS NULL: usa ix_nota_cambio_evaluacion_alumno_fecha.
         LEFT JOIN LATERAL (SELECT nc.responsable_id, nc.fecha
                              FROM nota_cambio nc
                             WHERE nc.evaluacion_id = e.id AND nc.alumno_id IS NULL
                               AND nc.tipo = 'ENVIO'
                             ORDER BY nc.fecha DESC, nc.id DESC
                             LIMIT 1) envio ON true
         LEFT JOIN usuario u ON u.id = envio.responsable_id
        ORDER BY envio.fecha NULLS FIRST, s.codigo, s.numero, e.nombre, e.id`,
      [usuarioId],
    )
    return filas.map((fila) => ({
      ...fila,
      enviadaEl: fila.enviadaEl?.toISOString() ?? null,
    }))
  }

  // ESP-02: secciones vigentes donde el usuario ($2) es ayudante activo, en el
  // período activo de su universidad, con su profesor a cargo (o null). Para
  // otro rol, la lista queda vacía.
  async seccionesAyudante(
    contexto: ContextoUniversidad,
    usuarioId: string,
  ): Promise<SeccionAyudante[]> {
    if (contexto.rol !== 'AYUDANTE') {
      return []
    }
    const filas = await this.bd.consultarEnUniversidad<FilaSeccionAyudante>(
      contexto,
      `SELECT s.id, s.numero, c.id AS curso_id, c.codigo,
              c.nombre AS curso_nombre, pr.id AS profesor_id,
              pr.nombre AS profesor_nombre
         FROM ayudante_seccion a
         JOIN seccion s ON s.id = a.seccion_id
         JOIN curso c ON c.id = s.curso_id
         JOIN periodo p ON p.id = c.periodo_id
         LEFT JOIN usuario pr ON pr.id = s.profesor_id
        WHERE a.universidad_id = $1 AND a.usuario_id = $2
          AND a.archived_at IS NULL AND p.activo
          AND s.archived_at IS NULL AND c.archived_at IS NULL
        ORDER BY c.codigo, s.numero`,
      [usuarioId],
    )
    return filas.map((fila) => ({
      id: fila.id,
      numero: fila.numero,
      curso: {
        id: fila.curso_id,
        codigo: fila.codigo,
        nombre: fila.curso_nombre,
      },
      profesor:
        fila.profesor_id && fila.profesor_nombre
          ? { id: fila.profesor_id, nombre: fila.profesor_nombre }
          : null,
    }))
  }
}
