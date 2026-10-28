import type { Rol, UniversidadElegible } from '@cursus/shared'
import { Injectable, NotFoundException } from '@nestjs/common'
import type { EleccionSuperadmin } from '../auth/auth.service.js'
import { BaseDeDatos } from '../database/base-de-datos.service.js'

// MT-04 (ADR 0002): dónde puede trabajar el superadmin. Lee todas las
// universidades con consultarComoSuperadmin, que responde 403 a otro rol.
@Injectable()
export class SuperadminService {
  constructor(private readonly bd: BaseDeDatos) {}

  // Universidades vigentes, cada una con sus facultades vigentes.
  async listarUniversidades(
    rol: Rol | undefined,
  ): Promise<UniversidadElegible[]> {
    return this.bd.consultarComoSuperadmin<UniversidadElegible>(
      rol,
      `SELECT un.id, un.nombre,
              COALESCE(
                json_agg(json_build_object('id', f.id, 'nombre', f.nombre)
                         ORDER BY f.nombre, f.id)
                  FILTER (WHERE f.id IS NOT NULL),
                '[]'
              ) AS facultades
         FROM universidad un
         LEFT JOIN facultad f ON f.universidad_id = un.id
                             AND f.archived_at IS NULL
        WHERE un.archived_at IS NULL
        GROUP BY un.id
        ORDER BY un.nombre, un.id`,
    )
  }

  // 404 si la facultad no existe, no es de esa universidad o alguna de las
  // dos está archivada.
  async verificarEleccion(
    rol: Rol | undefined,
    eleccion: EleccionSuperadmin,
  ): Promise<void> {
    const [facultad] = await this.bd.consultarComoSuperadmin<{ id: string }>(
      rol,
      `SELECT f.id FROM facultad f
         JOIN universidad un ON un.id = f.universidad_id
        WHERE f.id = $1 AND un.id = $2
          AND f.archived_at IS NULL AND un.archived_at IS NULL`,
      [eleccion.facultadId, eleccion.universidadId],
    )
    if (!facultad) {
      throw new NotFoundException('La facultad no existe en esa universidad')
    }
  }
}
