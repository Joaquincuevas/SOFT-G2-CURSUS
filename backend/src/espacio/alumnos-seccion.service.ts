import type { AlumnosEspacio, SeccionEspacio } from '@cursus/shared'
import { Injectable } from '@nestjs/common'
import {
  BaseDeDatos,
  type ContextoUniversidad,
} from '../database/base-de-datos.service.js'
import { ALUMNOS_SECCION } from '../gestion/alumnos.sql.js'

type FilaAlumnos = Pick<AlumnosEspacio, 'alumnos'>

// ESP-05 (RN-06): alumnos inscritos en una sección que IntegranteSeccionGuard
// ya verificó, con la misma consulta que la lista de gestión (GES-18). Solo
// la pide el profesor (lo revisa el controlador), así que nunca corre como
// Director: siempre filtra por la universidad de la sesión, con RLS.
@Injectable()
export class AlumnosSeccionService {
  constructor(private readonly bd: BaseDeDatos) {}

  async listar(
    contexto: ContextoUniversidad,
    seccion: SeccionEspacio,
  ): Promise<AlumnosEspacio> {
    const [fila] = await this.bd.consultarEnUniversidad<FilaAlumnos>(
      contexto,
      `SELECT ${ALUMNOS_SECCION}
         FROM seccion s
        WHERE s.universidad_id = $1 AND s.id = $2`,
      [seccion.id],
    )
    const alumnos = fila?.alumnos ?? []
    return { total: alumnos.length, alumnos }
  }
}
