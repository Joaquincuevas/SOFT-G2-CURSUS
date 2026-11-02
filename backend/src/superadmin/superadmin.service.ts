import type { Rol, UniversidadElegible } from '@cursus/shared'
import { Injectable, NotFoundException } from '@nestjs/common'
import type { EleccionSuperadmin } from '../auth/auth.service.js'
import { BaseDeDatos } from '../database/base-de-datos.service.js'
import { SQL_UNIVERSIDADES } from './universidades.service.js'

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
      SQL_UNIVERSIDADES,
      [null],
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
