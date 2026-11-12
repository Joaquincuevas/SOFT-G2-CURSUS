import type { MetricasConsolidadas } from '@cursus/shared'
import { Injectable } from '@nestjs/common'
import {
  BaseDeDatos,
  type ContextoUniversidad,
} from '../database/base-de-datos.service.js'

// MET-01: todo el cálculo en una consulta, en la transacción READ ONLY del
// Director (consultarEnTodasLasUniversidades): la RLS de DIRECTOR lee todas
// las universidades. El período activo es por universidad (un índice único
// parcial lo garantiza): se toma el de cada una.
//
// - Secciones del período: vigentes, de un curso vigente del período activo
//   de su universidad.
// - Inscritos: inscripciones vigentes en esas secciones; un alumno en dos
//   secciones cuenta en cada una (la nota final es por sección).
// - Nota final: nota_final() (CalcularNotaFinal), la regla de NOT-14, con las
//   evaluaciones activas y solo notas PUBLICADAS vigentes. Solo cuentan las
//   FINAL (todo publicado y ponderaciones = 100). Aprueba con >= 4,0.
// - Asistencia: mismo denominador que ASI-05 (total_clases_asistencia, que no
//   sirve al Director porque exige universidad y rol): clases vigentes de la
//   sección con al menos una marca vigente; sin marca es ausente.
// - Consolidado ponderado por alumno: los numeradores y denominadores se
//   suman entre universidades antes de dividir.
const CONSOLIDADO = `
  WITH periodo_activo AS (
    SELECT p.id, p.universidad_id, p.anio, p.semestre, u.nombre AS universidad
      FROM periodo p JOIN universidad u ON u.id = p.universidad_id
     WHERE p.activo AND u.archived_at IS NULL
  ), secciones AS (
    SELECT s.id, s.universidad_id, cu.id AS curso_id
      FROM seccion s
      JOIN curso cu ON cu.id = s.curso_id AND cu.universidad_id = s.universidad_id
      JOIN periodo_activo p ON p.id = cu.periodo_id AND p.universidad_id = cu.universidad_id
     WHERE s.archived_at IS NULL AND cu.archived_at IS NULL
  ), inscritos AS (
    SELECT i.universidad_id, i.seccion_id, i.usuario_id AS alumno_id, s.curso_id
      FROM inscripcion i
      JOIN secciones s ON s.id = i.seccion_id AND s.universidad_id = i.universidad_id
     WHERE i.archived_at IS NULL
  ), finales AS (
    SELECT nf.tipo, nf.nota
      FROM inscritos ins
      CROSS JOIN LATERAL (
        SELECT array_agg(e.ponderacion::integer ORDER BY e.id) AS ponderaciones,
               array_agg(n.valor ORDER BY e.id) AS notas
          FROM evaluacion e
          LEFT JOIN nota n ON n.evaluacion_id = e.id
                          AND n.universidad_id = e.universidad_id
                          AND n.alumno_id = ins.alumno_id
                          AND n.estado = 'PUBLICADA'
                          AND n.archived_at IS NULL
         WHERE e.seccion_id = ins.seccion_id
           AND e.universidad_id = ins.universidad_id
           AND e.archived_at IS NULL
      ) ev
      CROSS JOIN LATERAL nota_final(
        coalesce(ev.ponderaciones, '{}'), coalesce(ev.notas, '{}')
      ) nf
     WHERE nf.tipo = 'FINAL'
  ), notas AS (
    SELECT count(*) AS evaluados,
           count(*) FILTER (WHERE nota >= 4.0) AS aprobados,
           round(avg(nota), 2) AS promedio
      FROM finales
  ), clases_registradas AS (
    SELECT c.id, c.universidad_id, c.seccion_id
      FROM clase c
      JOIN secciones s ON s.id = c.seccion_id AND s.universidad_id = c.universidad_id
     WHERE c.archived_at IS NULL AND EXISTS (
       SELECT 1 FROM asistencia a
        WHERE a.clase_id = c.id AND a.universidad_id = c.universidad_id
          AND a.archived_at IS NULL)
  ), marcas AS (
    SELECT count(*) AS registros,
           count(*) FILTER (WHERE a.presente) AS presentes
      FROM inscritos ins
      JOIN clases_registradas c ON c.seccion_id = ins.seccion_id
                               AND c.universidad_id = ins.universidad_id
      LEFT JOIN asistencia a ON a.clase_id = c.id AND a.universidad_id = c.universidad_id
                            AND a.alumno_id = ins.alumno_id AND a.archived_at IS NULL
  )
  SELECT coalesce((SELECT json_agg(json_build_object(
                     'universidad', universidad, 'anio', anio, 'semestre', semestre)
                     ORDER BY universidad)
                     FROM periodo_activo), '[]'::json) AS periodos,
         json_build_object(
           'valor', round(n.aprobados::numeric * 100 / NULLIF(n.evaluados, 0), 1)::float8,
           'aprobados', n.aprobados::int, 'evaluados', n.evaluados::int) AS aprobacion,
         json_build_object(
           'valor', n.promedio::float8, 'alumnos', n.evaluados::int) AS promedio,
         json_build_object(
           'valor', round(m.presentes::numeric * 100 / NULLIF(m.registros, 0), 2)::float8,
           'presentes', m.presentes::int, 'registros', m.registros::int) AS asistencia,
         (SELECT count(DISTINCT (universidad_id, alumno_id)) FROM inscritos)::int AS alumnos,
         (SELECT count(DISTINCT (universidad_id, curso_id)) FROM secciones)::int AS cursos
    FROM notas n CROSS JOIN marcas m`

@Injectable()
export class MetricasService {
  constructor(private readonly bd: BaseDeDatos) {}

  async consolidado(
    contexto: ContextoUniversidad,
  ): Promise<MetricasConsolidadas> {
    const [fila] =
      await this.bd.consultarEnTodasLasUniversidades<MetricasConsolidadas>(
        contexto,
        CONSOLIDADO,
      )
    return fila
  }
}
