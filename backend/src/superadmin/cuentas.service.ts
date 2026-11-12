import type {
  CuentaCreada,
  CuentaUniversidad,
  GuardarCuenta,
} from '@cursus/shared'
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { hash } from 'argon2'
import { AuthService } from '../auth/auth.service.js'
import { BaseDeDatos } from '../database/base-de-datos.service.js'
import {
  exigirDominio,
  generarPasswordProvisoria,
} from '../gestion/gestion.service.js'
import type { Superadmin } from './universidades.service.js'

type Consultas = Pick<BaseDeDatos, 'query'>

// Código de PostgreSQL para una restricción única violada.
const UNIQUE = '23505'

const SELECT_CUENTA = `
  SELECT u.id, u.nombre, u.correo, u.rol,
         CASE WHEN f.id IS NULL THEN NULL
              ELSE json_build_object('id', f.id, 'nombre', f.nombre)
         END AS facultad
    FROM usuario u
    LEFT JOIN facultad f ON f.id = u.facultad_id
   WHERE u.universidad_id = $1`

// El índice de correos incluye las cuentas archivadas: no se reutilizan.
const correoRepetido = () =>
  new ConflictException(
    'Ya existe una cuenta con ese correo, vigente o archivada',
  )

// Un correo repetido por otra petición simultánea también es un 409.
function traducirError(error: unknown): never {
  if ((error as { code?: string }).code === UNIQUE) throw correoRepetido()
  throw error
}

// GES-24: el superadmin crea, edita y archiva cuentas de cualquier rol en
// cualquier universidad, desde su vista global. Cada cambio queda en
// superadmin_cambio. Las rutas van bajo la universidad porque la RLS de usuario
// exige fijarla antes de ver sus cuentas (enUniversidadComoSuperadmin): una
// cuenta de otra universidad responde 404. Nada se borra: archivar marca
// archived_at, y el correo sigue ocupado.
@Injectable()
export class CuentasService {
  constructor(
    private readonly bd: BaseDeDatos,
    private readonly auth: AuthService,
  ) {}

  async listar(
    superadmin: Superadmin,
    universidadId: string,
  ): Promise<CuentaUniversidad[]> {
    return this.bd.enUniversidadComoSuperadmin(
      superadmin,
      universidadId,
      async (tx) => {
        await this.dominioDe(tx, universidadId)
        return tx.query<CuentaUniversidad>(
          `${SELECT_CUENTA} AND u.archived_at IS NULL
           ORDER BY lower(u.nombre), u.id`,
          [universidadId],
        )
      },
    )
  }

  // La contraseña provisoria solo va en esta respuesta (en la base queda su
  // hash) y debe cambiarse en el primer ingreso (PER-03). Un correo ya
  // registrado en la universidad, con cualquier rol, responde 409.
  async crear(
    superadmin: Superadmin,
    universidadId: string,
    datos: GuardarCuenta,
  ): Promise<CuentaCreada> {
    try {
      return await this.bd.enUniversidadComoSuperadmin(
        superadmin,
        universidadId,
        async (tx) => {
          exigirDominio(datos.correo, await this.dominioDe(tx, universidadId))
          await this.validarFacultad(tx, universidadId, datos)
          await this.exigirCorreoLibre(tx, universidadId, datos.correo)

          const passwordProvisoria = generarPasswordProvisoria()
          const [{ id }] = await tx.query<{ id: string }>(
            `INSERT INTO usuario (universidad_id, facultad_id, nombre, correo, password_hash, rol, credencial_provisoria)
             VALUES ($1, $2, $3, $4, $5, $6, true)
             RETURNING id`,
            [
              universidadId,
              datos.facultadId ?? null,
              datos.nombre,
              datos.correo,
              await hash(passwordProvisoria),
              datos.rol,
            ],
          )
          return {
            cuenta: await this.leer(tx, universidadId, id),
            passwordProvisoria,
          }
        },
      )
    } catch (error) {
      traducirError(error)
    }
  }

  // Un rol distinto no se acepta si la persona tiene secciones, ayudantías o
  // inscripciones activas: quedarían a cargo de alguien con otro rol. Si se
  // acepta, se cierran sus sesiones, porque el JWT guarda el rol. La facultad
  // solo se elige para un Administrativo: otro rol conserva la que tenía,
  // salvo el Director, que no tiene.
  async editar(
    superadmin: Superadmin,
    universidadId: string,
    cuentaId: string,
    datos: GuardarCuenta,
  ): Promise<CuentaUniversidad> {
    let cambioRol = false
    let cuenta: CuentaUniversidad
    try {
      cuenta = await this.bd.enUniversidadComoSuperadmin(
        superadmin,
        universidadId,
        async (tx) => {
          const dominio = await this.dominioDe(tx, universidadId)
          const [actual] = await tx.query<{
            rol: string
            facultad_id: string | null
          }>(
            `SELECT rol, facultad_id FROM usuario
              WHERE universidad_id = $1 AND id = $2 AND archived_at IS NULL
              FOR UPDATE`,
            [universidadId, cuentaId],
          )
          if (!actual) {
            throw new NotFoundException('Cuenta no encontrada')
          }
          exigirDominio(datos.correo, dominio)
          await this.validarFacultad(tx, universidadId, datos)
          await this.exigirCorreoLibre(
            tx,
            universidadId,
            datos.correo,
            cuentaId,
          )

          cambioRol = actual.rol !== datos.rol
          if (cambioRol) {
            await this.exigirSinAsignaciones(tx, universidadId, cuentaId)
          }
          let facultadId = actual.facultad_id
          if (datos.rol === 'ADMINISTRATIVO') {
            facultadId = datos.facultadId ?? null
          } else if (datos.rol === 'DIRECTOR') {
            facultadId = null
          }
          // En un CTE: TypeORM entrega [filas, cantidad] para un UPDATE.
          await tx.query(
            `WITH editada AS (
               UPDATE usuario
                  SET nombre = $3, correo = $4, rol = $5, facultad_id = $6
                WHERE universidad_id = $1 AND id = $2
               RETURNING id)
             SELECT id FROM editada`,
            [
              universidadId,
              cuentaId,
              datos.nombre,
              datos.correo,
              datos.rol,
              facultadId,
            ],
          )
          return this.leer(tx, universidadId, cuentaId)
        },
      )
    } catch (error) {
      traducirError(error)
    }
    // Después del commit: sesion_auth no es accesible con el rol de la API.
    if (cambioRol) {
      await this.auth.revocarSesiones(cuentaId)
    }
    return cuenta
  }

  // No podrá iniciar sesión, y sus sesiones abiertas se cortan en la siguiente
  // petición (AuthService.sesionActiva). Se permite con asignaciones activas:
  // cortar el acceso puede ser urgente, y el Administrativo las reasigna
  // después (GES-12 y GES-14).
  async archivar(
    superadmin: Superadmin,
    universidadId: string,
    cuentaId: string,
  ): Promise<void> {
    await this.bd.enUniversidadComoSuperadmin(
      superadmin,
      universidadId,
      async (tx) => {
        await this.dominioDe(tx, universidadId)
        const archivada = await tx.query<{ id: string }>(
          `WITH archivada AS (
             UPDATE usuario SET archived_at = now()
              WHERE universidad_id = $1 AND id = $2 AND archived_at IS NULL
             RETURNING id)
           SELECT id FROM archivada`,
          [universidadId, cuentaId],
        )
        if (archivada.length === 0) {
          throw new NotFoundException('Cuenta no encontrada')
        }
      },
    )
  }

  // Dominio de una universidad vigente; si no, 404.
  private async dominioDe(
    tx: Consultas,
    universidadId: string,
  ): Promise<string> {
    const [universidad] = await tx.query<{ dominio_correo: string }>(
      `SELECT dominio_correo FROM universidad
        WHERE id = $1 AND archived_at IS NULL`,
      [universidadId],
    )
    if (!universidad) {
      throw new NotFoundException('Universidad no encontrada')
    }
    return universidad.dominio_correo
  }

  // Facultad obligatoria para un Administrativo, vigente y de esa universidad.
  // Ningún otro rol la elige.
  private async validarFacultad(
    tx: Consultas,
    universidadId: string,
    { rol, facultadId }: GuardarCuenta,
  ): Promise<void> {
    if (rol !== 'ADMINISTRATIVO') {
      if (facultadId) {
        throw new BadRequestException('Solo un Administrativo elige facultad')
      }
      return
    }
    if (!facultadId) {
      throw new BadRequestException('Elige la facultad del Administrativo')
    }
    const [facultad] = await tx.query<{ id: string }>(
      `SELECT id FROM facultad
        WHERE universidad_id = $1 AND id = $2 AND archived_at IS NULL`,
      [universidadId, facultadId],
    )
    if (!facultad) {
      throw new BadRequestException(
        'La facultad no es de esta universidad o está archivada',
      )
    }
  }

  private async exigirCorreoLibre(
    tx: Consultas,
    universidadId: string,
    correo: string,
    cuentaId: string | null = null,
  ): Promise<void> {
    const [existente] = await tx.query<{ id: string }>(
      `SELECT id FROM usuario
        WHERE universidad_id = $1 AND lower(correo) = $2
          AND ($3::uuid IS NULL OR id <> $3)`,
      [universidadId, correo, cuentaId],
    )
    if (existente) throw correoRepetido()
  }

  private async exigirSinAsignaciones(
    tx: Consultas,
    universidadId: string,
    cuentaId: string,
  ): Promise<void> {
    const [{ secciones, ayudantias, inscripciones }] = await tx.query<{
      secciones: number
      ayudantias: number
      inscripciones: number
    }>(
      `SELECT
         (SELECT count(*)::int FROM seccion_profesor sp
            JOIN seccion s ON s.id = sp.seccion_id AND s.universidad_id = sp.universidad_id
           WHERE sp.universidad_id = $1 AND sp.usuario_id = $2
             AND sp.archived_at IS NULL AND s.archived_at IS NULL) AS secciones,
         (SELECT count(*)::int FROM ayudante_seccion
           WHERE universidad_id = $1 AND usuario_id = $2
             AND archived_at IS NULL) AS ayudantias,
         (SELECT count(*)::int FROM inscripcion
           WHERE universidad_id = $1 AND usuario_id = $2
             AND archived_at IS NULL) AS inscripciones`,
      [universidadId, cuentaId],
    )
    if (secciones + ayudantias + inscripciones > 0) {
      throw new ConflictException(
        `No se puede cambiar el rol: tiene ${secciones} secciones a cargo, ${ayudantias} ayudantías y ${inscripciones} inscripciones activas. Quítaselas primero`,
      )
    }
  }

  private async leer(
    tx: Consultas,
    universidadId: string,
    cuentaId: string,
  ): Promise<CuentaUniversidad> {
    const [cuenta] = await tx.query<CuentaUniversidad>(
      `${SELECT_CUENTA} AND u.id = $2`,
      [universidadId, cuentaId],
    )
    return cuenta
  }
}
