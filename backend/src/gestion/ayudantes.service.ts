import type { AyudanteOpcion, AyudanteResumen } from '@cursus/shared'
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  BaseDeDatos,
  type ContextoUniversidad,
} from '../database/base-de-datos.service.js'
import type { AsignarAyudantesDto } from './asignar-ayudantes.dto.js'

const SECCION_VISIBLE = `
  SELECT s.id FROM seccion s
    JOIN curso c ON c.id = s.curso_id
    JOIN carrera ca ON ca.id = c.carrera_id
   WHERE s.universidad_id = $1 AND s.id = $2
     AND s.archived_at IS NULL AND c.archived_at IS NULL
     AND ca.facultad_id = facultad_actual($3)`

@Injectable()
export class AyudantesService {
  constructor(private readonly bd: BaseDeDatos) {}

  async listar(
    contexto: ContextoUniversidad,
    usuarioId: string,
    seccionId: string,
  ): Promise<AyudanteOpcion[]> {
    return this.bd.enTransaccionEnUniversidad(contexto, async (bd) => {
      const [seccion] = await bd.query(SECCION_VISIBLE, [
        contexto.universidadId,
        seccionId,
        usuarioId,
      ])
      if (!seccion) throw new NotFoundException('La sección no existe')
      // La tarjeta permite ayudantes de toda la universidad, no solo de la
      // facultad del curso. Nunca se ofrecen cuentas archivadas u otros roles.
      return bd.query<AyudanteOpcion>(
        `
        SELECT u.id, u.nombre, u.correo,
               EXISTS (SELECT 1 FROM ayudante_seccion a
                        WHERE a.seccion_id = $2 AND a.usuario_id = u.id
                          AND a.archived_at IS NULL) AS asignado
          FROM usuario u
         WHERE u.universidad_id = $1 AND u.rol = 'AYUDANTE' AND u.archived_at IS NULL
         ORDER BY u.nombre, u.correo, u.id`,
        [contexto.universidadId, seccionId],
      )
    })
  }

  async asignar(
    contexto: ContextoUniversidad,
    usuarioId: string,
    seccionId: string,
    datos: AsignarAyudantesDto,
  ): Promise<AyudanteResumen[]> {
    return this.bd.enTransaccionEnUniversidad(contexto, async (bd) => {
      const universidad = contexto.universidadId
      // Serializa las asignaciones de esta sección y evita escribir si se
      // archivó mientras se esperaba el bloqueo.
      const [seccion] = await bd.query(
        `${SECCION_VISIBLE} FOR UPDATE OF s, c`,
        [universidad, seccionId, usuarioId],
      )
      if (!seccion) throw new NotFoundException('La sección no existe')
      const ayudantes = await bd.query<AyudanteResumen>(
        `
        SELECT id, nombre, correo FROM usuario
         WHERE universidad_id = $1 AND id = ANY($2::uuid[])
           AND rol = 'AYUDANTE' AND archived_at IS NULL
         ORDER BY id FOR SHARE`,
        [universidad, datos.ayudanteIds],
      )
      // Se valida el conjunto completo antes de escribir: una opción ajena,
      // inexistente o inválida no deja una asignación parcial ni revela datos.
      if (ayudantes.length !== datos.ayudanteIds.length) {
        throw new BadRequestException(
          'Selecciona ayudantes activos de tu universidad',
        )
      }
      await bd.query(
        `
        INSERT INTO ayudante_seccion (universidad_id, seccion_id, usuario_id)
        SELECT $1, $2, unnest($3::uuid[])
        ON CONFLICT (seccion_id, usuario_id) WHERE archived_at IS NULL DO NOTHING`,
        [universidad, seccionId, datos.ayudanteIds],
      )
      return bd.query<AyudanteResumen>(
        `
        SELECT u.id, u.nombre, u.correo FROM ayudante_seccion a
          JOIN usuario u ON u.id = a.usuario_id
         WHERE a.universidad_id = $1 AND a.seccion_id = $2
           AND a.archived_at IS NULL AND u.archived_at IS NULL AND u.rol = 'AYUDANTE'
         ORDER BY u.nombre, u.correo, u.id`,
        [universidad, seccionId],
      )
    })
  }
}
