import {
  SUMA_PONDERACIONES_REQUERIDA,
  avisoPonderaciones,
} from '@cursus/shared'
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  BaseDeDatos,
  fijarUsuario,
  type ContextoUniversidad,
} from '../database/base-de-datos.service.js'

type Consulta = Pick<BaseDeDatos, 'query'>

// Crear, editar o archivar evaluaciones y publicar una nota FINAL deben usar
// esta misma clave, siempre antes de fijar filas. No aplica a publicar las
// notas de una evaluación (NOT-11).
export async function bloquearPonderaciones(
  bd: Consulta,
  contexto: ContextoUniversidad,
  seccionId: string,
) {
  await bd.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
    `ponderaciones:${contexto.universidadId.toLowerCase()}:${seccionId.toLowerCase()}`,
  ])
}

@Injectable()
export class PonderacionesService {
  constructor(private readonly bd: BaseDeDatos) {}

  // Puerta transaccional para el futuro flujo de nota final. El consumidor
  // debe escribir y auditar mediante `bd`, dentro del callback, sin abrir otra
  // conexión. No es un preflight HTTP ni autoriza publicar después del commit.
  async conNotaFinalValidada<T>(
    contexto: ContextoUniversidad,
    profesorId: string,
    seccionId: string,
    publicar: (bd: Consulta) => Promise<T>,
  ): Promise<T> {
    if (contexto.rol !== 'PROFESOR') throw new ForbiddenException()
    return this.bd.enTransaccionEnUniversidad(contexto, async (bd) => {
      await fijarUsuario(bd, profesorId)
      await bloquearPonderaciones(bd, contexto, seccionId)
      const [seccion] = await bd.query<{ esProfesor: boolean }>(
        `SELECT es_profesor_de_seccion(s.id, $3) AS "esProfesor"
           FROM seccion s
           JOIN curso c ON c.id = s.curso_id AND c.universidad_id = s.universidad_id
          WHERE s.universidad_id = $1 AND s.id = $2
            AND s.archived_at IS NULL AND c.archived_at IS NULL
          FOR SHARE OF s, c`,
        [contexto.universidadId, seccionId, profesorId],
      )
      if (!seccion) throw new NotFoundException('La sección no existe')
      if (!seccion.esProfesor)
        throw new ForbiddenException(
          'Solo el profesor de la sección publica la nota final',
        )
      const [{ suma }] = await bd.query<{ suma: number }>(
        `SELECT COALESCE(sum(ponderacion), 0)::int AS suma FROM evaluacion
          WHERE universidad_id = $1 AND seccion_id = $2 AND archived_at IS NULL`,
        [contexto.universidadId, seccionId],
      )
      if (suma !== SUMA_PONDERACIONES_REQUERIDA)
        throw new ConflictException({
          statusCode: 409,
          message: `No se puede publicar la nota final. ${avisoPonderaciones(suma)}`,
          sumaPonderaciones: suma,
          faltan: Math.max(0, SUMA_PONDERACIONES_REQUERIDA - suma),
          sobran: Math.max(0, suma - SUMA_PONDERACIONES_REQUERIDA),
        })
      return publicar(bd)
    })
  }
}
