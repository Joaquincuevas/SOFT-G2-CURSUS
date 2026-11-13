import type {
  NotaFinalAlumno,
  NotasFinalesSeccion,
  SeccionEspacio,
} from '@cursus/shared'
import { ForbiddenException, Injectable } from '@nestjs/common'
import {
  BaseDeDatos,
  type ContextoUniversidad,
} from '../database/base-de-datos.service.js'
import { calcularNotaFinal, type NotaPonderada } from './nota-final.js'

type AlumnoConNotas = Omit<NotaFinalAlumno, 'notaFinal'> & {
  evaluaciones: NotaPonderada[]
}

const ORDEN_EVALUACIONES = 'e.fecha, e.nombre, e.id'
const ORDEN_ALUMNOS = 'u.nombre COLLATE "es-CL-x-icu", u.correo, u.id'

// NOT-14 (RE-02): alumnos activos de la sección, por nombre como la lista de
// notas de una evaluación, con cada evaluación activa y su nota publicada o
// null: el mismo filtro de nota que mis-notas (MisNotasService).
const ALUMNOS_CON_NOTAS_PUBLICADAS = `
  SELECT u.id, u.nombre,
         COALESCE((SELECT json_agg(json_build_object(
                            'ponderacion', e.ponderacion,
                            'nota', n.valor::float8) ORDER BY ${ORDEN_EVALUACIONES})
                     FROM evaluacion e
                     LEFT JOIN nota n ON n.evaluacion_id = e.id
                                     AND n.universidad_id = e.universidad_id
                                     AND n.alumno_id = u.id
                                     AND n.estado = 'PUBLICADA'
                                     AND n.archived_at IS NULL
                    WHERE e.universidad_id = $1 AND e.seccion_id = $2
                      AND e.archived_at IS NULL), '[]') AS evaluaciones
    FROM inscripcion i
    JOIN usuario u ON u.id = i.usuario_id AND u.universidad_id = i.universidad_id
   WHERE i.universidad_id = $1 AND i.seccion_id = $2 AND i.archived_at IS NULL
   ORDER BY ${ORDEN_ALUMNOS}`

function textoCsv(valor: string): string {
  // Las planillas pueden ejecutar fórmulas incluso en celdas entre comillas.
  const seguro = /^[\t\r\n]|^\s*[=+@-]/u.test(valor) ? "'" + valor : valor
  return '"' + seguro.replaceAll('"', '""') + '"'
}

const notaCsv = (valor: number | null) =>
  valor === null ? '' : valor.toFixed(1).replace('.', ',')

@Injectable()
export class NotasFinalesService {
  constructor(private readonly bd: BaseDeDatos) {}

  // Solo el profesor de la sección: el alumno ve la suya en mis-notas.
  async obtener(
    contexto: ContextoUniversidad,
    seccion: SeccionEspacio,
  ): Promise<NotasFinalesSeccion> {
    if (contexto.rol !== 'PROFESOR' || seccion.rol !== 'PROFESOR') {
      throw new ForbiddenException(
        'Solo el profesor de la sección ve las notas finales',
      )
    }
    const filas = await this.bd.consultarEnUniversidad<AlumnoConNotas>(
      contexto,
      ALUMNOS_CON_NOTAS_PUBLICADAS,
      [seccion.id],
    )
    return {
      alumnos: filas.map(({ id, nombre, evaluaciones }) => ({
        id,
        nombre,
        notaFinal: calcularNotaFinal(evaluaciones),
      })),
    }
  }

  async exportarCsv(
    contexto: ContextoUniversidad,
    seccion: SeccionEspacio,
    profesorId: string,
  ): Promise<string> {
    const prohibido = () =>
      new ForbiddenException(
        'Solo el profesor de la sección puede exportar las notas',
      )
    if (contexto.rol !== 'PROFESOR' || seccion.rol !== 'PROFESOR')
      throw prohibido()

    // Una sentencia comparte la misma instantánea para los encabezados, las
    // notas y la asignación vigente del profesor.
    const [datos] = await this.bd.consultarEnUniversidad<{
      encabezados: string[]
      alumnos: AlumnoConNotas[]
    }>(
      contexto,
      `SELECT ARRAY(
                SELECT e.nombre FROM evaluacion e
                 WHERE e.universidad_id = $1 AND e.seccion_id = $2 AND e.archived_at IS NULL
                 ORDER BY ${ORDEN_EVALUACIONES}
              ) AS encabezados,
              COALESCE((SELECT json_agg(a) FROM (${ALUMNOS_CON_NOTAS_PUBLICADAS}) a), '[]') AS alumnos
         FROM seccion s JOIN curso c ON c.id = s.curso_id AND c.universidad_id = s.universidad_id
        WHERE s.universidad_id = $1 AND s.id = $2
          AND s.archived_at IS NULL AND c.archived_at IS NULL
          AND es_profesor_de_seccion(s.id, $3)`,
      [seccion.id, profesorId],
    )
    if (!datos) throw prohibido()
    const encabezado = ['Alumno', ...datos.encabezados, 'Nota final']
      .map(textoCsv)
      .join(';')
    const filas = datos.alumnos.map(({ nombre, evaluaciones }) => {
      const final = calcularNotaFinal(evaluaciones)
      return [
        textoCsv(nombre),
        ...evaluaciones.map(({ nota }) => notaCsv(nota)),
        notaCsv(final.tipo === 'FINAL' ? final.nota : null),
      ].join(';')
    })
    return '\uFEFF' + [encabezado, ...filas].join('\r\n') + '\r\n'
  }
}
