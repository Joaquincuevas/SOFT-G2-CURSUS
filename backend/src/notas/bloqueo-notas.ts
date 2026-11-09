import type { BaseDeDatos } from '../database/base-de-datos.service.js'

// La edición de evaluaciones y las escrituras de notas comparten este lock.
export const bloquearNotasDe = (
  bd: Pick<BaseDeDatos, 'query'>,
  evaluacionId: string,
) =>
  bd.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
    `notas:${evaluacionId.toLowerCase()}`,
  ])
