import type {
  MetricasConsolidadas,
  MetricasUniversidad,
  PeriodoDisponible,
  MetricasFacultad,
  MetricasCarrera,
  ReporteFacultad,
  ResumenUniversidad,
} from '@cursus/shared'
import { Injectable, NotFoundException } from '@nestjs/common'
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
//   sección con al menos una marca vigente; sin marca es ausente. Como el
//   resumen de ASI-05, solo cuenta cuentas de alumno vigentes: archivar la
//   cuenta de un alumno sin retirar su inscripción lo saca del indicador.
// - Consolidado ponderado por alumno: los numeradores y denominadores se
//   suman entre universidades antes de dividir.
//
// MET-04: la misma base (BASE) alimenta los tres niveles: consolidado,
// universidades y facultades de una universidad. BASE deja una fila por nota
// final y una por registro de asistencia, con su universidad y facultad
// (curso → carrera → facultad); cada nivel solo agrupa. Parámetros de BASE:
// $1 universidad (null = todas), $2 y $3 año y semestre del período (null =
// el período activo de cada universidad).
const BASE = `
  WITH periodo_activo AS (
    SELECT p.id, p.universidad_id, p.anio, p.semestre, u.nombre AS universidad
      FROM periodo p JOIN universidad u ON u.id = p.universidad_id
     WHERE u.archived_at IS NULL
       AND ($1::uuid IS NULL OR u.id = $1::uuid)
       AND CASE WHEN $2::int IS NULL THEN p.activo
                ELSE p.anio = $2::int AND p.semestre = $3::int END
  ), secciones AS (
    SELECT s.id, s.universidad_id, cu.id AS curso_id,
           cu.codigo AS curso_codigo, cu.nombre AS curso_nombre,
           ca.id AS carrera_id, ca.nombre AS carrera_nombre, ca.facultad_id
      FROM seccion s
      JOIN curso cu ON cu.id = s.curso_id AND cu.universidad_id = s.universidad_id
      JOIN carrera ca ON ca.id = cu.carrera_id AND ca.universidad_id = cu.universidad_id
      JOIN periodo_activo p ON p.id = cu.periodo_id AND p.universidad_id = cu.universidad_id
     WHERE s.archived_at IS NULL
  ), inscritos AS (
    SELECT i.universidad_id, i.seccion_id, i.usuario_id AS alumno_id,
           s.curso_id, s.curso_codigo, s.curso_nombre, s.carrera_id,
           s.carrera_nombre, s.facultad_id
      FROM inscripcion i
      JOIN secciones s ON s.id = i.seccion_id AND s.universidad_id = i.universidad_id
     WHERE i.archived_at IS NULL
  ), finales AS (
    SELECT ins.universidad_id, ins.facultad_id, ins.carrera_id,
           ins.curso_id, ins.curso_codigo, ins.curso_nombre,
           ins.carrera_nombre, nf.nota
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
  ), clases_registradas AS (
    SELECT c.id, c.universidad_id, c.seccion_id
      FROM clase c
      JOIN secciones s ON s.id = c.seccion_id AND s.universidad_id = c.universidad_id
     WHERE c.archived_at IS NULL AND EXISTS (
       SELECT 1 FROM asistencia a
        WHERE a.clase_id = c.id AND a.universidad_id = c.universidad_id
          AND a.archived_at IS NULL)
  ), registros AS (
    SELECT ins.universidad_id, ins.facultad_id, ins.carrera_id,
           ins.curso_id, ins.curso_codigo, ins.curso_nombre,
           ins.carrera_nombre, coalesce(a.presente, false) AS presente
      FROM inscritos ins
      JOIN usuario u ON u.id = ins.alumno_id AND u.universidad_id = ins.universidad_id
                    AND u.archived_at IS NULL AND u.rol = 'ALUMNO'
      JOIN clases_registradas c ON c.seccion_id = ins.seccion_id
                               AND c.universidad_id = ins.universidad_id
      LEFT JOIN asistencia a ON a.clase_id = c.id AND a.universidad_id = c.universidad_id
                            AND a.alumno_id = ins.alumno_id AND a.archived_at IS NULL
  )`

// Los tres indicadores de un grupo, con los alias de sus agregados: n (notas
// finales: evaluados, aprobados, promedio) y a (asistencia: registros,
// presentes). Sin denominador, el valor es null y los conteos son 0.
const aprobacion = (n: string) => `json_build_object(
  'valor', round(${n}.aprobados::numeric * 100 / NULLIF(${n}.evaluados, 0), 1)::float8,
  'aprobados', coalesce(${n}.aprobados, 0)::int,
  'evaluados', coalesce(${n}.evaluados, 0)::int)`
const promedio = (n: string) => `json_build_object(
  'valor', ${n}.promedio::float8, 'alumnos', coalesce(${n}.evaluados, 0)::int)`
const asistencia = (a: string) => `json_build_object(
  'valor', round(${a}.presentes::numeric * 100 / NULLIF(${a}.registros, 0), 2)::float8,
  'presentes', coalesce(${a}.presentes, 0)::int,
  'registros', coalesce(${a}.registros, 0)::int)`

// Agregados por grupo (k = universidad o facultad). El consolidado usa los
// mismos agregados sin agrupar.
const agregados = (clave: string | null) => `
  , notas AS (
    SELECT ${clave ? `${clave} AS k,` : ''}
           count(*) AS evaluados,
           count(*) FILTER (WHERE nota >= 4.0) AS aprobados,
           round(avg(nota), 2) AS promedio
      FROM finales ${clave ? 'GROUP BY 1' : ''}
  ), asist AS (
    SELECT ${clave ? `${clave} AS k,` : ''}
           count(*) AS registros,
           count(*) FILTER (WHERE presente) AS presentes
      FROM registros ${clave ? 'GROUP BY 1' : ''}
  )`

const CONSOLIDADO = `${BASE}${agregados(null)}
  SELECT coalesce((SELECT json_agg(json_build_object(
                     'universidad', universidad, 'anio', anio, 'semestre', semestre)
                     ORDER BY universidad)
                     FROM periodo_activo), '[]'::json) AS periodos,
         ${aprobacion('n')} AS aprobacion,
         ${promedio('n')} AS promedio,
         ${asistencia('a')} AS asistencia,
         (SELECT count(DISTINCT (universidad_id, alumno_id)) FROM inscritos)::int AS alumnos,
         (SELECT count(DISTINCT (universidad_id, curso_id)) FROM secciones)::int AS cursos
    FROM notas n CROSS JOIN asist a`

// Alumnos y cursos de un grupo, con su universidad o facultad como clave.
const volumen = (clave: string) => `
  , alumnos AS (
    SELECT ${clave} AS k, count(DISTINCT alumno_id) AS n FROM inscritos GROUP BY 1
  ), cursos AS (
    SELECT ${clave} AS k, count(DISTINCT curso_id) AS n FROM secciones GROUP BY 1
  )`

// MET-04, nivel universidades: una fila por universidad vigente, con su
// período (el pedido o su activo) y sus tres indicadores.
const UNIVERSIDADES = `${BASE}${agregados('universidad_id')}${volumen('universidad_id')}
  SELECT u.id, u.nombre,
         (SELECT json_build_object('anio', p.anio, 'semestre', p.semestre)
            FROM periodo_activo p WHERE p.universidad_id = u.id) AS periodo,
         ${aprobacion('n')} AS aprobacion,
         ${promedio('n')} AS promedio,
         ${asistencia('a')} AS asistencia,
         coalesce(al.n, 0)::int AS alumnos,
         coalesce(cu.n, 0)::int AS cursos
    FROM universidad u
    LEFT JOIN notas n ON n.k = u.id
    LEFT JOIN asist a ON a.k = u.id
    LEFT JOIN alumnos al ON al.k = u.id
    LEFT JOIN cursos cu ON cu.k = u.id
   WHERE u.archived_at IS NULL
   ORDER BY u.nombre COLLATE "es-CL-x-icu", u.id`

// MET-04, nivel facultades: la universidad ($1) con sus facultades vigentes,
// también las que no tienen datos (sus indicadores son null). Sin fila si la
// universidad no existe o está archivada.
const FACULTADES = `${BASE}${agregados('facultad_id')}${volumen('facultad_id')}
  SELECT json_build_object('id', u.id, 'nombre', u.nombre) AS universidad,
         (SELECT json_build_object('anio', p.anio, 'semestre', p.semestre)
            FROM periodo_activo p WHERE p.universidad_id = u.id) AS periodo,
         coalesce((SELECT json_agg(json_build_object(
                     'id', f.id, 'nombre', f.nombre,
                     'aprobacion', ${aprobacion('n')},
                     'promedio', ${promedio('n')},
                     'asistencia', ${asistencia('a')},
                     'alumnos', coalesce(al.n, 0)::int,
                     'cursos', coalesce(cu.n, 0)::int)
                     ORDER BY f.nombre COLLATE "es-CL-x-icu", f.id)
                     FROM facultad f
                     LEFT JOIN notas n ON n.k = f.id
                     LEFT JOIN asist a ON a.k = f.id
                     LEFT JOIN alumnos al ON al.k = f.id
                     LEFT JOIN cursos cu ON cu.k = f.id
                    WHERE f.universidad_id = u.id AND f.archived_at IS NULL),
                  '[]'::json) AS facultades
    FROM universidad u
   WHERE u.id = $1::uuid AND u.archived_at IS NULL`

// MET-05, carreras de una facultad vigente (de cualquier universidad: la
// universidad sale de la facultad). La dimensión carrera sale de la
// tabla carrera para conservar también las carreras sin datos; los agregados
// reutilizan las filas de finales y registros de BASE.
const CARRERAS = `${BASE}
  , notas_carrera AS (
    SELECT carrera_id, count(*) AS evaluados,
           count(*) FILTER (WHERE nota >= 4.0) AS aprobados,
           round(avg(nota), 2) AS promedio
      FROM finales
     WHERE facultad_id = $4::uuid
     GROUP BY carrera_id
  ), asist_carrera AS (
    SELECT carrera_id, count(*) AS registros,
           count(*) FILTER (WHERE presente) AS presentes
      FROM registros
     WHERE facultad_id = $4::uuid
     GROUP BY carrera_id
  )
  SELECT json_build_object('id', u.id, 'nombre', u.nombre) AS universidad,
         json_build_object('id', f.id, 'nombre', f.nombre) AS facultad,
         (SELECT json_build_object('anio', p.anio, 'semestre', p.semestre)
            FROM periodo_activo p WHERE p.universidad_id = u.id) AS periodo,
         coalesce((SELECT json_agg(json_build_object(
           'id', ca.id, 'nombre', ca.nombre,
           'aprobacion', ${aprobacion('n')},
           'promedio', ${promedio('n')},
           'asistencia', ${asistencia('a')})
           ORDER BY ca.nombre COLLATE "es-CL-x-icu", ca.id)
           FROM carrera ca
           LEFT JOIN notas_carrera n ON n.carrera_id = ca.id
           LEFT JOIN asist_carrera a ON a.carrera_id = ca.id
          WHERE ca.universidad_id = u.id
            AND ca.facultad_id = f.id
            AND ca.archived_at IS NULL), '[]'::json) AS carreras
    FROM facultad f
    JOIN universidad u ON u.id = f.universidad_id
   WHERE f.id = $4::uuid
     AND u.archived_at IS NULL
     AND f.archived_at IS NULL`

// MET-06, cursos de una carrera vigente. La dimensión sale de curso para
// conservar los cursos sin notas o asistencia; los agregados reutilizan BASE.
// No se filtra curso.archived_at: un período cerrado puede tener cursos
// archivados y sus indicadores siguen siendo consultables.
const CURSOS = `${BASE}
  , notas_curso AS (
    SELECT curso_id, count(*) AS evaluados,
           count(*) FILTER (WHERE nota >= 4.0) AS aprobados,
           round(avg(nota), 2) AS promedio
      FROM finales
     WHERE carrera_id = $4::uuid
     GROUP BY curso_id
  ), asist_curso AS (
    SELECT curso_id, count(*) AS registros,
           count(*) FILTER (WHERE presente) AS presentes
      FROM registros
     WHERE carrera_id = $4::uuid
     GROUP BY curso_id
  )
  SELECT json_build_object('id', u.id, 'nombre', u.nombre) AS universidad,
         json_build_object('id', f.id, 'nombre', f.nombre) AS facultad,
         json_build_object('id', ca.id, 'nombre', ca.nombre) AS carrera,
         (SELECT json_build_object('anio', p.anio, 'semestre', p.semestre)
            FROM periodo_activo p WHERE p.universidad_id = u.id) AS periodo,
         coalesce((SELECT json_agg(json_build_object(
           'id', cu.id, 'codigo', cu.codigo, 'nombre', cu.nombre,
           'aprobacion', ${aprobacion('n')},
           'promedio', ${promedio('n')},
           'asistencia', ${asistencia('a')})
           ORDER BY cu.codigo COLLATE "es-CL-x-icu", cu.id)
           FROM curso cu
           JOIN periodo_activo p ON p.id = cu.periodo_id
                                AND p.universidad_id = cu.universidad_id
           LEFT JOIN notas_curso n ON n.curso_id = cu.id
           LEFT JOIN asist_curso a ON a.curso_id = cu.id
          WHERE cu.universidad_id = u.id
            AND cu.carrera_id = ca.id), '[]'::json) AS cursos
    FROM carrera ca
    JOIN facultad f ON f.id = ca.facultad_id
                   AND f.universidad_id = ca.universidad_id
    JOIN universidad u ON u.id = ca.universidad_id
   WHERE ca.id = $4::uuid
     AND ca.archived_at IS NULL
     AND f.archived_at IS NULL
     AND u.archived_at IS NULL`

// MET-08: las dimensiones (carreras y cursos) salen de los cursos del período y
// de la facultad de la sesión, tengan o no secciones: un curso recién creado
// aparece con sus indicadores en null. Los agregados reutilizan las filas de
// finales y registros de BASE. El promedio de una carrera suma las notas
// finales con su precisión original y redondea una sola vez al final; no
// pondera promedios de curso ya redondeados.
const REPORTE_FACULTAD = `${BASE}
  , cursos_reporte AS (
    SELECT ca.id AS carrera_id, ca.nombre AS carrera_nombre,
           cu.id AS curso_id, cu.codigo AS curso_codigo, cu.nombre AS curso_nombre
      FROM curso cu
      JOIN carrera ca ON ca.id = cu.carrera_id AND ca.universidad_id = cu.universidad_id
      JOIN periodo_activo p ON p.id = cu.periodo_id AND p.universidad_id = cu.universidad_id
     WHERE ca.facultad_id = facultad_actual(usuario_actual())
  ), notas_curso AS (
    SELECT carrera_id, curso_id, count(*) AS evaluados,
           count(*) FILTER (WHERE nota >= 4.0) AS aprobados,
           sum(nota) AS suma,
           round(avg(nota), 2) AS promedio
      FROM finales
     WHERE facultad_id = facultad_actual(usuario_actual())
     GROUP BY carrera_id, curso_id
  ), asistencia_curso AS (
    SELECT carrera_id, curso_id, count(*) AS registros,
           count(*) FILTER (WHERE presente) AS presentes
      FROM registros
     WHERE facultad_id = facultad_actual(usuario_actual())
     GROUP BY carrera_id, curso_id
  ), carreras_reporte AS (
    SELECT c.carrera_id, c.carrera_nombre,
           json_agg(json_build_object(
             'id', c.curso_id, 'codigo', c.curso_codigo, 'nombre', c.curso_nombre,
             'aprobacion', ${aprobacion('n')},
             'promedio', ${promedio('n')},
             'asistencia', ${asistencia('a')}
           ) ORDER BY c.curso_codigo, c.curso_id) AS cursos,
           sum(coalesce(n.evaluados, 0)) AS evaluados,
           sum(coalesce(n.aprobados, 0)) AS aprobados,
           round(sum(coalesce(n.suma, 0)) / NULLIF(sum(n.evaluados), 0), 2) AS promedio,
           sum(coalesce(a.registros, 0)) AS registros,
           sum(coalesce(a.presentes, 0)) AS presentes
      FROM cursos_reporte c
      LEFT JOIN notas_curso n ON n.carrera_id = c.carrera_id AND n.curso_id = c.curso_id
      LEFT JOIN asistencia_curso a ON a.carrera_id = c.carrera_id AND a.curso_id = c.curso_id
     GROUP BY c.carrera_id, c.carrera_nombre
  )
  SELECT json_build_object('id', f.id, 'nombre', f.nombre) AS facultad,
         (SELECT json_build_object('anio', p.anio, 'semestre', p.semestre)
            FROM periodo_activo p) AS periodo,
         coalesce((SELECT json_agg(json_build_object(
           'id', r.carrera_id, 'nombre', r.carrera_nombre,
           'aprobacion', json_build_object(
             'valor', round(r.aprobados::numeric * 100 / NULLIF(r.evaluados, 0), 1)::float8,
             'aprobados', r.aprobados::int, 'evaluados', r.evaluados::int),
           'promedio', json_build_object(
             'valor', r.promedio::float8, 'alumnos', r.evaluados::int),
           'asistencia', json_build_object(
             'valor', round(r.presentes::numeric * 100 / NULLIF(r.registros, 0), 2)::float8,
             'presentes', r.presentes::int, 'registros', r.registros::int),
           'cursos', r.cursos) ORDER BY r.carrera_nombre, r.carrera_id)
           FROM carreras_reporte r), '[]'::json) AS carreras
    FROM facultad f
   WHERE f.universidad_id = $1::uuid
     AND f.id = facultad_actual(usuario_actual())
     AND f.archived_at IS NULL`

// Período pedido en la URL (MET-03 agrega el selector): null es el activo.
export interface PeriodoPedido {
  anio: number
  semestre: number
}

@Injectable()
export class MetricasService {
  constructor(private readonly bd: BaseDeDatos) {}

  periodos(contexto: ContextoUniversidad): Promise<PeriodoDisponible[]> {
    return this.bd.consultarEnTodasLasUniversidades<PeriodoDisponible>(
      contexto,
      `SELECT p.anio, p.semestre, bool_or(p.activo) AS activo
         FROM periodo p
         JOIN universidad u ON u.id = p.universidad_id
        WHERE u.archived_at IS NULL
        GROUP BY p.anio, p.semestre
        ORDER BY p.anio DESC, p.semestre DESC`,
    )
  }

  // MET-04: con periodo, el de cada universidad que lo tenga; sin él, el
  // activo. Los tres niveles usan el mismo período.
  async consolidado(
    contexto: ContextoUniversidad,
    periodo: PeriodoPedido | null = null,
  ): Promise<MetricasConsolidadas> {
    const [fila] =
      await this.bd.consultarEnTodasLasUniversidades<MetricasConsolidadas>(
        contexto,
        CONSOLIDADO,
        [null, periodo?.anio ?? null, periodo?.semestre ?? null],
      )
    return fila
  }

  // MET-04: cada universidad con sus indicadores, para entrar a una.
  universidades(
    contexto: ContextoUniversidad,
    periodo: PeriodoPedido | null,
  ): Promise<ResumenUniversidad[]> {
    return this.bd.consultarEnTodasLasUniversidades<ResumenUniversidad>(
      contexto,
      UNIVERSIDADES,
      [null, periodo?.anio ?? null, periodo?.semestre ?? null],
    )
  }

  // MET-04: las facultades de una universidad con los tres indicadores. 404 si
  // la universidad no existe.
  async facultades(
    contexto: ContextoUniversidad,
    universidadId: string,
    periodo: PeriodoPedido | null,
  ): Promise<MetricasUniversidad> {
    const [fila] =
      await this.bd.consultarEnTodasLasUniversidades<MetricasUniversidad>(
        contexto,
        FACULTADES,
        [universidadId, periodo?.anio ?? null, periodo?.semestre ?? null],
      )
    if (!fila) throw new NotFoundException('La universidad no existe')
    return fila
  }

  async carreras(
    contexto: ContextoUniversidad,
    facultadId: string,
    periodo: PeriodoPedido | null,
  ): Promise<MetricasFacultad> {
    const [fila] =
      await this.bd.consultarEnTodasLasUniversidades<MetricasFacultad>(
        contexto,
        CARRERAS,
        // $1 null: el Director ve las facultades de todas las universidades,
        // no solo la de su sesión; la facultad ($4) fija la universidad.
        [null, periodo?.anio ?? null, periodo?.semestre ?? null, facultadId],
      )
    if (!fila) throw new NotFoundException('La facultad no existe')
    return fila
  }

  async cursos(
    contexto: ContextoUniversidad,
    carreraId: string,
    periodo: PeriodoPedido | null,
  ): Promise<MetricasCarrera> {
    const [fila] =
      await this.bd.consultarEnTodasLasUniversidades<MetricasCarrera>(
        contexto,
        CURSOS,
        [null, periodo?.anio ?? null, periodo?.semestre ?? null, carreraId],
      )
    if (!fila) throw new NotFoundException('La carrera no existe')
    return fila
  }

  async reporteFacultad(
    contexto: ContextoUniversidad,
    usuarioId: string,
    periodo: PeriodoPedido | null,
  ): Promise<ReporteFacultad> {
    const [fila] =
      await this.bd.consultarFacultadDelAdministrativo<ReporteFacultad>(
        contexto,
        usuarioId,
        REPORTE_FACULTAD,
        [periodo?.anio ?? null, periodo?.semestre ?? null],
      )
    return fila
  }
}
