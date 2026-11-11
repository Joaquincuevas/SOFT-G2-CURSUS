import type { ProfesorAsignable, ProfesorResumen } from '@cursus/shared'
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  BaseDeDatos,
  type ContextoUniversidad,
} from '../database/base-de-datos.service.js'

// Sección vigente de un curso de la facultad del usuario ($1 = universidad,
// $2 = sección, $3 = usuario), como en GES-13.
const SECCION_VISIBLE = `
  SELECT s.id FROM seccion s
    JOIN curso c ON c.id = s.curso_id
    JOIN carrera ca ON ca.id = c.carrera_id
   WHERE s.universidad_id = $1 AND s.id = $2
     AND s.archived_at IS NULL AND c.archived_at IS NULL
     AND ca.facultad_id = facultad_actual($3)`

// Profesores vigentes de la sección ($1 = universidad, $2 = sección).
export const PROFESORES_ASIGNADOS = `
  SELECT u.id, u.nombre, u.correo FROM seccion_profesor sp
    JOIN usuario u ON u.id = sp.usuario_id AND u.universidad_id = sp.universidad_id
   WHERE sp.universidad_id = $1 AND sp.seccion_id = $2
     AND sp.archived_at IS NULL AND u.archived_at IS NULL AND u.rol = 'PROFESOR'
   ORDER BY u.nombre, u.correo, u.id`

// GES-25: varios profesores por sección, con el patrón de los ayudantes
// (GES-13). Quitar uno con motivo está en AsignacionesService (GES-14).
@Injectable()
export class ProfesoresService {
  constructor(private readonly bd: BaseDeDatos) {}

  // Profesores de toda la universidad, como en GES-12, con los asignados a
  // la sección marcados. Nunca cuentas archivadas ni de otro rol.
  async listar(
    contexto: ContextoUniversidad,
    usuarioId: string,
    seccionId: string,
  ): Promise<ProfesorAsignable[]> {
    return this.bd.enTransaccionEnUniversidad(contexto, async (bd) => {
      const [seccion] = await bd.query(SECCION_VISIBLE, [
        contexto.universidadId,
        seccionId,
        usuarioId,
      ])
      if (!seccion) throw new NotFoundException('La sección no existe')
      return bd.query<ProfesorAsignable>(
        `SELECT u.id, u.nombre, u.correo,
                EXISTS (SELECT 1 FROM seccion_profesor sp
                         WHERE sp.seccion_id = $2 AND sp.usuario_id = u.id
                           AND sp.archived_at IS NULL) AS asignado
           FROM usuario u
          WHERE u.universidad_id = $1 AND u.rol = 'PROFESOR' AND u.archived_at IS NULL
          ORDER BY u.nombre, u.correo, u.id`,
        [contexto.universidadId, seccionId],
      )
    })
  }

  // Agrega un profesor sin tocar a los demás. 404 si la sección o el
  // profesor no existen (o no son de la facultad o universidad), y 409 si ya
  // está asignado. Devuelve los asignados.
  async agregar(
    contexto: ContextoUniversidad,
    usuarioId: string,
    seccionId: string,
    profesorId: string,
  ): Promise<ProfesorResumen[]> {
    return this.bd.enTransaccionEnUniversidad(contexto, async (bd) => {
      const universidad = contexto.universidadId
      // Serializa los cambios de asignación de la sección, como GES-13 y
      // GES-14.
      const [seccion] = await bd.query(
        `${SECCION_VISIBLE} FOR UPDATE OF s, c`,
        [universidad, seccionId, usuarioId],
      )
      if (!seccion) throw new NotFoundException('La sección no existe')
      const [profesor] = await bd.query<{ nombre: string; asignado: boolean }>(
        `SELECT u.nombre,
                EXISTS (SELECT 1 FROM seccion_profesor sp
                         WHERE sp.seccion_id = $3 AND sp.usuario_id = u.id
                           AND sp.archived_at IS NULL) AS asignado
           FROM usuario u
          WHERE u.universidad_id = $1 AND u.id = $2 AND u.rol = 'PROFESOR'
            AND u.archived_at IS NULL
          FOR SHARE OF u`,
        [universidad, profesorId, seccionId],
      )
      if (!profesor) throw new NotFoundException('El profesor no existe')
      if (profesor.asignado) {
        throw new ConflictException(
          `${profesor.nombre} ya es profesor de esta sección`,
        )
      }
      await bd.query(
        `INSERT INTO seccion_profesor (universidad_id, seccion_id, usuario_id)
         VALUES ($1, $2, $3)`,
        [universidad, seccionId, profesorId],
      )
      return bd.query<ProfesorResumen>(PROFESORES_ASIGNADOS, [
        universidad,
        seccionId,
      ])
    })
  }
}
