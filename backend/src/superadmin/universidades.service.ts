import type {
  CrearUniversidad,
  EditarUniversidad,
  FacultadElegible,
  Rol,
  UniversidadElegible,
} from '@cursus/shared'
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { QueryFailedError } from 'typeorm'
import { BaseDeDatos } from '../database/base-de-datos.service.js'

// Superadmin que hace la acción (el usuario de la sesión).
export interface Superadmin {
  id: string
  rol: Rol | undefined
}

// Universidades vigentes, cada una con sus facultades vigentes. $1 filtra por
// una universidad, o NULL para todas.
export const SQL_UNIVERSIDADES = `
  SELECT un.id, un.nombre, un.dominio_correo AS "dominioCorreo", un.color,
         COALESCE(
           json_agg(json_build_object('id', f.id, 'nombre', f.nombre)
                    ORDER BY f.nombre, f.id)
             FILTER (WHERE f.id IS NOT NULL),
           '[]'
         ) AS facultades
    FROM universidad un
    LEFT JOIN facultad f ON f.universidad_id = un.id
                        AND f.archived_at IS NULL
   WHERE un.archived_at IS NULL AND ($1::uuid IS NULL OR un.id = $1)
   GROUP BY un.id
   ORDER BY un.nombre, un.id`

// Restricciones de la base y el 409 que corresponde a cada una.
const DUPLICADOS: Record<string, string> = {
  uq_universidad_nombre: 'Ya existe una universidad con ese nombre',
  ux_universidad_nombre_normalizado: 'Ya existe una universidad con ese nombre',
  uq_universidad_dominio_correo: 'Ya existe una universidad con ese dominio',
  uq_facultad_universidad_nombre:
    'Ya existe una facultad con ese nombre en esta universidad',
  ux_facultad_universidad_nombre_normalizado:
    'Ya existe una facultad con ese nombre en esta universidad',
}
// Reglas que revisan los triggers de GestionarUniversidades: su mensaje ya
// explica el motivo.
const REGLAS = [
  'ck_universidad_dominio_con_usuarios',
  'ck_universidad_dominio_superadmin',
  'ck_facultad_archivada_sin_uso',
]

// Un nombre repetido o una regla de la base es un 409; el resto sigue igual.
function traducirError(error: unknown): never {
  if (error instanceof QueryFailedError) {
    const fallo = error.driverError as {
      code?: string
      constraint?: string
      message?: string
    }
    const restriccion = fallo.constraint ?? ''
    if (fallo.code === '23505' && DUPLICADOS[restriccion]) {
      throw new ConflictException(DUPLICADOS[restriccion])
    }
    if (fallo.code === '23001' && REGLAS.includes(restriccion)) {
      throw new ConflictException(fallo.message)
    }
  }
  throw error
}

// GES-23: el superadmin crea, edita y archiva universidades y facultades desde
// su vista global. Los UPDATE van en un CTE: así la consulta devuelve solo las
// filas (TypeORM entrega [filas, cantidad] para un UPDATE). Escribe con escribirComoSuperadmin: la RLS solo deja
// escribir en estas tablas al superadmin, y cada cambio queda en
// superadmin_cambio. Nada se borra: archivar marca archived_at, y lo archivado
// deja de aparecer en las listas.
@Injectable()
export class UniversidadesService {
  constructor(private readonly bd: BaseDeDatos) {}

  async crearUniversidad(
    superadmin: Superadmin,
    datos: CrearUniversidad,
  ): Promise<UniversidadElegible> {
    try {
      return await this.bd.escribirComoSuperadmin(superadmin, async (tx) => {
        const [{ id }] = await tx.query<{ id: string }>(
          `INSERT INTO universidad (nombre, dominio_correo, color)
           VALUES ($1, $2, $3) RETURNING id`,
          [datos.nombre, datos.dominioCorreo, datos.color],
        )
        return this.leer(tx, id)
      })
    } catch (error) {
      traducirError(error)
    }
  }

  async editarUniversidad(
    superadmin: Superadmin,
    id: string,
    datos: EditarUniversidad,
  ): Promise<UniversidadElegible> {
    if (
      datos.nombre === undefined &&
      datos.dominioCorreo === undefined &&
      datos.color === undefined
    ) {
      throw new BadRequestException('Indica qué datos cambiar')
    }
    try {
      return await this.bd.escribirComoSuperadmin(superadmin, async (tx) => {
        const editada = await tx.query<{ id: string }>(
          `WITH editada AS (
             UPDATE universidad
                SET nombre = COALESCE($2, nombre),
                    dominio_correo = COALESCE($3, dominio_correo),
                    color = COALESCE($4, color)
              WHERE id = $1 AND archived_at IS NULL
             RETURNING id)
           SELECT id FROM editada`,
          [
            id,
            datos.nombre ?? null,
            datos.dominioCorreo ?? null,
            datos.color ?? null,
          ],
        )
        if (editada.length === 0) {
          throw new NotFoundException('Universidad no encontrada')
        }
        return this.leer(tx, id)
      })
    } catch (error) {
      traducirError(error)
    }
  }

  // Sus usuarios dejan de poder iniciar sesión (ver AuthService), y la
  // elección de un superadmin que trabajaba en ella deja de valer.
  async archivarUniversidad(superadmin: Superadmin, id: string): Promise<void> {
    const archivada = await this.bd.escribirComoSuperadmin(superadmin, (tx) =>
      tx.query<{ id: string }>(
        `WITH archivada AS (
           UPDATE universidad SET archived_at = now()
            WHERE id = $1 AND archived_at IS NULL
           RETURNING id)
         SELECT id FROM archivada`,
        [id],
      ),
    )
    if (archivada.length === 0) {
      throw new NotFoundException('Universidad no encontrada')
    }
  }

  async crearFacultad(
    superadmin: Superadmin,
    universidadId: string,
    nombre: string,
  ): Promise<FacultadElegible> {
    try {
      const [facultad] = await this.bd.escribirComoSuperadmin(
        superadmin,
        (tx) =>
          tx.query<FacultadElegible>(
            `INSERT INTO facultad (universidad_id, nombre)
             SELECT id, $2 FROM universidad
              WHERE id = $1 AND archived_at IS NULL
             RETURNING id, nombre`,
            [universidadId, nombre],
          ),
      )
      if (!facultad) {
        throw new NotFoundException('Universidad no encontrada')
      }
      return facultad
    } catch (error) {
      traducirError(error)
    }
  }

  async editarFacultad(
    superadmin: Superadmin,
    id: string,
    nombre: string,
  ): Promise<FacultadElegible> {
    try {
      const [facultad] = await this.bd.escribirComoSuperadmin(
        superadmin,
        (tx) =>
          tx.query<FacultadElegible>(
            `WITH editada AS (
               UPDATE facultad f SET nombre = $2
                 FROM universidad un
                WHERE f.id = $1 AND un.id = f.universidad_id
                  AND f.archived_at IS NULL AND un.archived_at IS NULL
               RETURNING f.id, f.nombre)
             SELECT id, nombre FROM editada`,
            [id, nombre],
          ),
      )
      if (!facultad) {
        throw new NotFoundException('Facultad no encontrada')
      }
      return facultad
    } catch (error) {
      traducirError(error)
    }
  }

  // Solo sin carreras ni usuarios vigentes (lo revisa la base).
  async archivarFacultad(superadmin: Superadmin, id: string): Promise<void> {
    try {
      const archivada = await this.bd.escribirComoSuperadmin(superadmin, (tx) =>
        tx.query<{ id: string }>(
          `WITH archivada AS (
             UPDATE facultad SET archived_at = now()
              WHERE id = $1 AND archived_at IS NULL
             RETURNING id)
           SELECT id FROM archivada`,
          [id],
        ),
      )
      if (archivada.length === 0) {
        throw new NotFoundException('Facultad no encontrada')
      }
    } catch (error) {
      traducirError(error)
    }
  }

  private async leer(
    tx: Pick<BaseDeDatos, 'query'>,
    id: string,
  ): Promise<UniversidadElegible> {
    const [universidad] = await tx.query<UniversidadElegible>(
      SQL_UNIVERSIDADES,
      [id],
    )
    return universidad
  }
}
