import {
  ZONA_HORARIA_UNIVERSIDAD,
  type DetalleHistorialAlumno,
  type PeriodoHistorialAlumno,
} from '@cursus/shared'
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  BaseDeDatos,
  fijarUsuario,
  type ContextoUniversidad,
} from '../database/base-de-datos.service.js'
import { calcularNotaFinal } from './nota-final.js'

type FilaHistorial = Omit<DetalleHistorialAlumno, 'notaFinal'>

// La titularidad la comprueban tanto la consulta como la RLS de NOT-13.
// Se conservan las notas propias publicadas aunque haya terminado la
// inscripción o el curso se haya archivado.
const HISTORIAL = `
  WITH propias AS (
    SELECT n.evaluacion_id, n.valor, n.recorreccion_id
      FROM nota n
     WHERE n.universidad_id = $1 AND n.alumno_id = $2
       AND n.estado = 'PUBLICADA' AND n.archived_at IS NULL
  ), secciones_propias AS (
    SELECT DISTINCT e.seccion_id
      FROM propias n
      JOIN evaluacion e ON e.id = n.evaluacion_id AND e.universidad_id = $1
     WHERE e.archived_at IS NULL AND ($4::uuid IS NULL OR e.seccion_id = $4)
  )
  SELECT s.id AS "seccionId", s.numero AS seccion,
         json_build_object('id', c.id, 'codigo', c.codigo, 'nombre', c.nombre) AS curso,
         json_build_object('id', p.id, 'anio', p.anio, 'semestre', p.semestre) AS periodo,
         (
           SELECT json_agg(json_build_object(
             'evaluacionId', e.id, 'nombre', e.nombre,
             'fecha', to_char(e.fecha, 'YYYY-MM-DD'), 'ponderacion', e.ponderacion,
             'nota', n.valor, 'recorregida', n.recorreccion_id IS NOT NULL
           ) ORDER BY e.fecha, e.nombre, e.id)
             FROM evaluacion e
             LEFT JOIN propias n ON n.evaluacion_id = e.id
            WHERE e.seccion_id = s.id AND e.universidad_id = s.universidad_id
              AND e.archived_at IS NULL
         ) AS evaluaciones
    FROM secciones_propias sp
    JOIN seccion s ON s.id = sp.seccion_id AND s.universidad_id = $1
    JOIN curso c ON c.id = s.curso_id AND c.universidad_id = s.universidad_id
    JOIN periodo p ON p.id = c.periodo_id AND p.universidad_id = c.universidad_id
   WHERE s.archived_at IS NULL AND public.curso_cerrado(c.id)
     AND p.fecha_termino < (CURRENT_TIMESTAMP AT TIME ZONE $3)::date
   ORDER BY p.anio DESC, p.semestre DESC, c.codigo, s.numero`

@Injectable()
export class HistorialAlumnoService {
  constructor(private readonly bd: BaseDeDatos) {}

  async listar(
    contexto: ContextoUniversidad,
    alumnoId: string,
  ): Promise<PeriodoHistorialAlumno[]> {
    const filas = await this.consultar(contexto, alumnoId, null)
    const porPeriodo = new Map<string, PeriodoHistorialAlumno>()
    for (const { periodo, evaluaciones, ...curso } of filas) {
      let grupo = porPeriodo.get(periodo.id)
      if (!grupo) {
        grupo = { periodo, cursos: [] }
        porPeriodo.set(periodo.id, grupo)
      }
      grupo.cursos.push({
        ...curso,
        notaFinal: calcularNotaFinal(evaluaciones),
      })
    }
    return [...porPeriodo.values()]
  }

  async obtener(
    contexto: ContextoUniversidad,
    alumnoId: string,
    seccionId: string,
  ): Promise<DetalleHistorialAlumno> {
    const [fila] = await this.consultar(contexto, alumnoId, seccionId)
    if (!fila) throw new NotFoundException('La sección no está en tu historial')
    return { ...fila, notaFinal: calcularNotaFinal(fila.evaluaciones) }
  }

  private consultar(
    contexto: ContextoUniversidad,
    alumnoId: string,
    seccionId: string | null,
  ) {
    if (contexto.rol !== 'ALUMNO') throw new ForbiddenException()
    return this.bd.enTransaccionEnUniversidad(contexto, async (bd) => {
      await fijarUsuario(bd, alumnoId)
      return bd.query<FilaHistorial>(HISTORIAL, [
        contexto.universidadId,
        alumnoId,
        ZONA_HORARIA_UNIVERSIDAD,
        seccionId,
      ])
    })
  }
}
