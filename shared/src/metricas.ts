// MET-01: GET /api/metricas/consolidado, solo para el Director. Los tres
// indicadores del período activo de cada universidad, consolidados entre
// universidades y ponderados por alumno. Cada valor es null cuando su
// denominador es 0 ("Sin datos suficientes"), nunca 0.

export interface PeriodoConsolidado {
  universidad: string
  anio: number
  semestre: number
}

// Alumnos con nota final FINAL (todas las evaluaciones publicadas y
// ponderaciones = 100, como NOT-14) con nota >= 4,0, sobre los que la tienen.
// valor en porcentaje con un decimal.
export interface IndicadorAprobacion {
  valor: number | null
  aprobados: number
  evaluados: number
}

// Promedio de esas mismas notas finales, con dos decimales.
export interface IndicadorPromedio {
  valor: number | null
  alumnos: number
}

// Presentes sobre alumno-clase: cada inscripción vigente por cada clase de su
// sección con asistencia registrada, como el denominador de ASI-05. Sin marca
// cuenta como ausente. valor en porcentaje con dos decimales.
export interface IndicadorAsistencia {
  valor: number | null
  presentes: number
  registros: number
}

export interface MetricasConsolidadas {
  periodos: PeriodoConsolidado[]
  aprobacion: IndicadorAprobacion
  promedio: IndicadorPromedio
  asistencia: IndicadorAsistencia
  // Alumnos distintos con inscripción vigente y cursos del período activo.
  alumnos: number
  cursos: number
}

// MET-04: drill-down del Director. Los mismos tres indicadores y alcance de
// MET-01, por universidad y por facultad.
export interface PeriodoMetrica {
  anio: number
  semestre: number
}

// GET /api/metricas/periodos: períodos únicos disponibles para el Director.
export interface PeriodoDisponible extends PeriodoMetrica {
  activo: boolean
}

interface IndicadoresDeGrupo {
  aprobacion: IndicadorAprobacion
  promedio: IndicadorPromedio
  asistencia: IndicadorAsistencia
  alumnos: number
  cursos: number
}

// GET /api/metricas/universidades?periodo=AAAA-S. periodo es null si la
// universidad no tiene el período pedido (o ninguno activo).
export interface ResumenUniversidad extends IndicadoresDeGrupo {
  id: string
  nombre: string
  periodo: PeriodoMetrica | null
}

export interface IndicadoresFacultad extends IndicadoresDeGrupo {
  id: string
  nombre: string
}

// GET /api/metricas/universidades/:id/facultades?periodo=AAAA-S. Trae todas
// las facultades vigentes, también las que no tienen datos.
export interface MetricasUniversidad {
  universidad: { id: string; nombre: string }
  periodo: PeriodoMetrica | null
  facultades: IndicadoresFacultad[]
}

// MET-05: carreras vigentes de una facultad del Director.
export interface IndicadoresCarrera extends Pick<
  IndicadoresFacultad,
  'aprobacion' | 'promedio' | 'asistencia'
> {
  id: string
  nombre: string
}

export interface MetricasFacultad {
  universidad: { id: string; nombre: string }
  facultad: { id: string; nombre: string }
  periodo: PeriodoMetrica | null
  carreras: IndicadoresCarrera[]
}

// MET-06: cursos vigentes de una carrera del Director.
export interface IndicadoresCurso extends Pick<
  IndicadoresFacultad,
  'aprobacion' | 'promedio' | 'asistencia'
> {
  id: string
  codigo: string
  nombre: string
}

export interface MetricasCarrera {
  universidad: { id: string; nombre: string }
  facultad: { id: string; nombre: string }
  carrera: { id: string; nombre: string }
  periodo: PeriodoMetrica | null
  cursos: IndicadoresCurso[]
}

// MET-08: reporte del Administrativo sobre su facultad, agrupado por carrera
// y curso. Los tres indicadores son null cuando no tienen denominador.
export interface ReporteCurso extends Pick<
  IndicadoresFacultad,
  'aprobacion' | 'promedio' | 'asistencia'
> {
  id: string
  codigo: string
  nombre: string
}

export interface ReporteCarrera extends Pick<
  IndicadoresFacultad,
  'aprobacion' | 'promedio' | 'asistencia'
> {
  id: string
  nombre: string
  cursos: ReporteCurso[]
}

export interface ReporteFacultad {
  facultad: { id: string; nombre: string }
  periodo: PeriodoMetrica | null
  carreras: ReporteCarrera[]
}
