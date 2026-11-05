// Solo expresiones SQL constantes del servicio; nunca datos de la petición.
// ASI-05/06 comparten denominador (total_clases_asistencia) y redondeo.
export const porcentajeAsistenciaSql = (asistidas: string, total: string) =>
  `round((${asistidas})::numeric * 100 / NULLIF(${total}, 0), 2)::double precision`
