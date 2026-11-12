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
