import type { SeccionAyudante, SeccionDashboard } from '@cursus/shared'
import { Injectable } from '@nestjs/common'
import {
  BaseDeDatos,
  type ContextoUniversidad,
} from '../database/base-de-datos.service.js'
import { BLOQUES_HORARIO } from '../gestion/horarios.sql.js'

interface FilaSeccion {
  id: string
  numero: number
  curso_id: string
  codigo: string
  curso_nombre: string
  horario: SeccionDashboard['horario']
  alumnos: number
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
      `SELECT s.id, s.numero, c.id AS curso_id, c.codigo,
              c.nombre AS curso_nombre, ${BLOQUES_HORARIO} AS horario,
              (SELECT count(*)::int FROM inscripcion i
                WHERE i.seccion_id = s.id AND i.archived_at IS NULL) AS alumnos
         FROM seccion s
         JOIN curso c ON c.id = s.curso_id
         JOIN periodo p ON p.id = c.periodo_id
        WHERE s.universidad_id = $1 AND s.profesor_id = $2 AND p.activo
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
      horario: fila.horario,
      alumnos: fila.alumnos,
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
