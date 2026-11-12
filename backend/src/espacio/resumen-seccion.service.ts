import type { SeccionEspacio, SeccionResumen } from '@cursus/shared'
import { Injectable } from '@nestjs/common'
import {
  BaseDeDatos,
  type ContextoUniversidad,
} from '../database/base-de-datos.service.js'
import { BLOQUES_HORARIO } from '../gestion/horarios.sql.js'
import { NOMBRES_PROFESORES } from './profesores.sql.js'

type FilaResumen = Pick<
  SeccionResumen,
  'horario' | 'profesor' | 'profesores' | 'ayudantes' | 'cursoCerrado'
>

const COLUMNAS = `
  (public.curso_cerrado(s.curso_id) OR EXISTS (
    SELECT 1 FROM cierre_curso cc WHERE cc.id = s.curso_id AND cc.universidad_id = s.universidad_id
  )) AS "cursoCerrado",
  ${BLOQUES_HORARIO} AS horario,
  CASE WHEN pr.id IS NULL THEN NULL
       ELSE json_build_object('id', pr.id, 'nombre', pr.nombre) END AS profesor,
  ${NOMBRES_PROFESORES()} AS profesores,
  (SELECT COALESCE(json_agg(json_build_object('id', u.id, 'nombre', u.nombre)
                            ORDER BY u.nombre, u.id), '[]')
     FROM ayudante_seccion a JOIN usuario u ON u.id = a.usuario_id
    WHERE a.seccion_id = s.id AND a.archived_at IS NULL
      AND u.archived_at IS NULL AND u.rol = 'AYUDANTE') AS ayudantes
  FROM seccion s
  LEFT JOIN usuario pr ON pr.id = s.profesor_id`

// ESP-04 (RE-04): horario con sala, profesor y ayudantes activos de una
// sección que IntegranteSeccionGuard ya verificó. El Director la lee en
// cualquier universidad, como en ESP-06.
@Injectable()
export class ResumenSeccionService {
  constructor(private readonly bd: BaseDeDatos) {}

  async obtener(
    contexto: ContextoUniversidad,
    seccion: SeccionEspacio,
  ): Promise<SeccionResumen> {
    const [fila] =
      contexto.rol === 'DIRECTOR'
        ? await this.bd.consultarEnTodasLasUniversidades<FilaResumen>(
            contexto,
            `SELECT ${COLUMNAS} WHERE s.id = $1`,
            [seccion.id],
          )
        : await this.bd.consultarEnUniversidad<FilaResumen>(
            contexto,
            `SELECT ${COLUMNAS} WHERE s.universidad_id = $1 AND s.id = $2`,
            [seccion.id],
          )
    const { cursoCerrado, ...resumen } = fila
    return { ...seccion, ...resumen, ...(cursoCerrado && { cursoCerrado }) }
  }
}
