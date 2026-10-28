import { createHash, randomBytes } from 'node:crypto'
import type { Rol, UsuarioSesion } from '@cursus/shared'
import { Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { hash, verify } from 'argon2'
import { duracionRefresh } from '../config/entorno.js'
import {
  BaseDeDatos,
  type ContextoUniversidad,
} from '../database/base-de-datos.service.js'

// Contenido del JWT de sesión. universidad_id es null solo para el
// superadmin, que no tiene universidad propia (MT-04).
export interface PayloadJwt {
  sid?: string
  sub: string
  rol: Rol
  universidad_id: string | null
}

interface Credenciales {
  id: string
  rol: Rol
  universidad_id: string | null
  password_hash: string
}

// MT-04. Universidad y facultad que eligió el superadmin en esta sesión.
export interface EleccionSuperadmin {
  universidadId: string
  facultadId: string
}

// Estado de la sesión que JwtAuthGuard lee de la base en cada petición.
export interface SesionVigente {
  credencialProvisoria: boolean
  // Solo del superadmin, si eligió una facultad que sigue vigente.
  eleccion: EleccionSuperadmin | null
}

// Tokens de una sesión: el JWT de acceso, que vive en memoria del frontend, y
// el refresh token opaco, que viaja solo en una cookie HttpOnly.
export interface TokensSesion {
  accessToken: string
  refreshToken: string
}

// Los refresh tokens se guardan solo como sha256, en hex.
const hashDe = (token: string) =>
  createHash('sha256').update(token).digest('hex')

interface FilaUsuario {
  id: string
  nombre: string
  correo: string
  rol: Rol
  universidad_id: string
  universidad_nombre: string
  facultad_nombre: string | null
  credencial_provisoria: boolean
}

// El Director ve todas las universidades: el Figma lo muestra como "Directorio".
const NOMBRE_DIRECTORIO = 'Directorio'
// El superadmin, mientras no elige una universidad, ve la plataforma.
const NOMBRE_PLATAFORMA = 'CURSUS'

@Injectable()
export class AuthService {
  // Si el correo no existe se verifica igual contra este hash, para que el
  // tiempo de respuesta no revele qué correos están registrados.
  private readonly hashRelleno = hash(randomBytes(32).toString('hex'))
  // Se lee al crear el servicio, para que un valor inválido falle al arrancar.
  readonly segundosRefresh = duracionRefresh()

  constructor(
    private readonly bd: BaseDeDatos,
    private readonly jwt: JwtService,
  ) {}

  // Devuelve los tokens de la sesión, o null si las credenciales no son válidas.
  async iniciarSesion(
    correo: string,
    password: string,
    bd: Pick<BaseDeDatos, 'query'> = this.bd,
  ): Promise<TokensSesion | null> {
    // El correo es único por universidad, no global: la universidad se
    // identifica por el dominio del correo. Por eso no usa
    // consultarEnUniversidad: antes del login no hay universidad de sesión.
    // El superadmin no tiene universidad (MT-04): su correo es único entre
    // los superadmins y no es de un dominio de universidad
    // (crear-superadmin.ts). Si aun así calzaran dos, gana el de la
    // universidad. Un usuario archivado responde igual que uno que no existe.
    const [usuario] = await bd.query<Credenciales>(
      `SELECT u.id, u.rol, u.universidad_id, u.password_hash
         FROM usuario u
         LEFT JOIN universidad un ON un.id = u.universidad_id
        WHERE lower(u.correo) = $1
          AND (un.dominio_correo = split_part($1, '@', 2)
               OR (u.universidad_id IS NULL AND u.rol = 'SUPERADMIN'))
          AND u.archived_at IS NULL
        ORDER BY u.universidad_id NULLS LAST
        LIMIT 1`,
      [correo.trim().toLowerCase()],
    )
    const passwordValida = await verify(
      usuario?.password_hash ?? (await this.hashRelleno),
      password,
    )
    if (!usuario || !passwordValida) {
      return null
    }
    return this.emitirTokens(usuario, undefined, bd)
  }

  // Rota el refresh token: lo revoca y emite uno nuevo junto a un JWT de
  // acceso. Devuelve null si el token no existe, expiró o ya estaba revocado.
  // Reusar un token ya revocado (por ejemplo, uno robado que ya se rotó)
  // revoca todas las sesiones de su usuario. Como cerrarSesion, emitirTokens y
  // sesionActiva, no usa consultarEnUniversidad: refresh_token y sesion_auth
  // no son tablas institucionales.
  async renovarSesion(refreshToken: string): Promise<TokensSesion | null> {
    const hashToken = hashDe(refreshToken)
    // El UPDATE es atómico: dos renovaciones simultáneas del mismo token no
    // pueden ganar las dos. Va en un CTE porque TypeORM devuelve [filas,
    // afectadas] para un UPDATE suelto.
    // Un usuario archivado no renueva: el token se revoca igual y, como no
    // devuelve fila, se revocan también todas sus sesiones.
    const [usuario] = await this.bd.query<
      Omit<Credenciales, 'password_hash'> & { sesion_id: string }
    >(
      `WITH rotado AS (
         UPDATE refresh_token SET revocado_en = now()
          WHERE hash = $1 AND revocado_en IS NULL AND expira_en > now()
            AND sesion_id IN (SELECT id FROM sesion_auth WHERE revocado_en IS NULL)
          RETURNING usuario_id, sesion_id
       )
       SELECT u.id, u.rol, u.universidad_id, rotado.sesion_id
         FROM rotado JOIN usuario u ON u.id = rotado.usuario_id
        WHERE u.archived_at IS NULL`,
      [hashToken],
    )
    if (!usuario) {
      await this.bd.query(
        `UPDATE sesion_auth SET revocado_en = now()
          WHERE usuario_id = (SELECT usuario_id FROM refresh_token
            WHERE hash = $1 AND revocado_en IS NOT NULL)
            AND revocado_en IS NULL`,
        [hashToken],
      )
      await this.bd.query(
        `UPDATE refresh_token SET revocado_en = now()
          WHERE revocado_en IS NULL
            AND usuario_id = (
              SELECT usuario_id FROM refresh_token
               WHERE hash = $1 AND revocado_en IS NOT NULL
            )`,
        [hashToken],
      )
      return null
    }
    return this.emitirTokens(usuario, usuario.sesion_id)
  }

  // Revoca el refresh token, si sigue activo. No avisa si no existía.
  async cerrarSesion(refreshToken: string): Promise<void> {
    // También cubre un token que acaba de rotarse en otra petición: todos los
    // descendientes pertenecen a la misma sesión y quedan inutilizables.
    await this.bd.query(
      `UPDATE sesion_auth SET revocado_en = now()
        WHERE id = (SELECT sesion_id FROM refresh_token WHERE hash = $1)
          AND revocado_en IS NULL`,
      [hashDe(refreshToken)],
    )
    await this.bd.query(
      `UPDATE refresh_token SET revocado_en = now()
        WHERE sesion_id = (SELECT sesion_id FROM refresh_token WHERE hash = $1)
          AND revocado_en IS NULL`,
      [hashDe(refreshToken)],
    )
  }

  private async emitirTokens(
    usuario: Omit<Credenciales, 'password_hash'>,
    sesionId?: string,
    bd: Pick<BaseDeDatos, 'query'> = this.bd,
  ): Promise<TokensSesion> {
    if (!sesionId) {
      const [sesion] = await bd.query<{ id: string }>(
        `INSERT INTO sesion_auth (usuario_id) VALUES ($1) RETURNING id`,
        [usuario.id],
      )
      sesionId = sesion.id
    }
    const refreshToken = randomBytes(32).toString('base64url')
    await bd.query(
      `INSERT INTO refresh_token (usuario_id, hash, expira_en, sesion_id)
       VALUES ($1, $2, now() + make_interval(secs => $3), $4)`,
      [usuario.id, hashDe(refreshToken), this.segundosRefresh, sesionId],
    )
    const accessToken = await this.jwt.signAsync({
      sid: sesionId,
      sub: usuario.id,
      rol: usuario.rol,
      universidad_id: usuario.universidad_id,
    } satisfies PayloadJwt)
    return { accessToken, refreshToken }
  }

  // Correo del usuario vigente, para el límite de intentos por cuenta del
  // cambio de contraseña (PER-02). null si no existe o está archivado.
  async correoDe(usuarioId: string): Promise<string | null> {
    const [usuario] = await this.bd.query<{ correo: string }>(
      `SELECT correo FROM usuario WHERE id = $1 AND archived_at IS NULL`,
      [usuarioId],
    )
    return usuario?.correo ?? null
  }

  // PER-02. Cambia la contraseña del usuario de la sesión y cierra sus demás
  // sesiones; la actual (sesionId) sigue abierta. Devuelve null si la
  // contraseña actual no es correcta (cuenta como intento fallido) e 'igual'
  // si la nueva es la misma.
  //
  // Como el login, no usa consultarEnUniversidad: la contraseña es una
  // credencial, no un dato institucional, y también la cambia el Director, que
  // no modifica datos (ADR 0001). Solo toca la fila del id del JWT.
  async cambiarPassword(
    usuarioId: string,
    sesionId: string,
    actual: string,
    nueva: string,
    bd: Pick<BaseDeDatos, 'query'> = this.bd,
  ): Promise<'cambiada' | 'igual' | null> {
    const [usuario] = await bd.query<{ password_hash: string }>(
      `SELECT password_hash FROM usuario
        WHERE id = $1 AND archived_at IS NULL
        FOR UPDATE`,
      [usuarioId],
    )
    if (!usuario || !(await verify(usuario.password_hash, actual))) {
      return null
    }
    if (nueva === actual) {
      return 'igual'
    }

    // Con la contraseña nueva deja de ser provisoria (PER-03).
    await bd.query(
      `UPDATE usuario SET password_hash = $2, credencial_provisoria = false
        WHERE id = $1`,
      [usuarioId, await hash(nueva)],
    )
    // Las demás sesiones quedan fuera: si alguien entró con la contraseña
    // anterior, ya no puede seguir usándola ni renovarla.
    await bd.query(
      `UPDATE sesion_auth SET revocado_en = now()
        WHERE usuario_id = $1 AND id <> $2 AND revocado_en IS NULL`,
      [usuarioId, sesionId],
    )
    await bd.query(
      `UPDATE refresh_token SET revocado_en = now()
        WHERE usuario_id = $1 AND sesion_id <> $2 AND revocado_en IS NULL`,
      [usuarioId, sesionId],
    )
    return 'cambiada'
  }

  // null si la sesión ya no sirve. También corta la sesión de un usuario
  // archivado, sin esperar a que venza su JWT. Devuelve además, en la misma
  // consulta, si el usuario todavía tiene la contraseña provisoria (PER-03) y
  // la facultad que eligió el superadmin (MT-04). Si esa facultad o su
  // universidad se archivan, la elección deja de valer y debe elegir otra.
  async sesionActiva(
    sid: string,
    usuarioId: string,
  ): Promise<SesionVigente | null> {
    const [sesion] = await this.bd.query<{
      credencial_provisoria: boolean
      universidad_id: string | null
      facultad_id: string | null
    }>(
      `SELECT u.credencial_provisoria, un.id AS universidad_id,
              f.id AS facultad_id
         FROM sesion_auth s
         JOIN usuario u ON u.id = s.usuario_id
         LEFT JOIN facultad f ON u.rol = 'SUPERADMIN'
                             AND f.id = s.facultad_activa_id
                             AND f.universidad_id = s.universidad_activa_id
                             AND f.archived_at IS NULL
         LEFT JOIN universidad un ON un.id = f.universidad_id
                                 AND un.archived_at IS NULL
        WHERE s.id::text = $1 AND s.usuario_id::text = $2
          AND s.revocado_en IS NULL AND u.archived_at IS NULL`,
      [sid, usuarioId],
    )
    if (!sesion) {
      return null
    }
    return {
      credencialProvisoria: sesion.credencial_provisoria,
      eleccion:
        sesion.universidad_id && sesion.facultad_id
          ? {
              universidadId: sesion.universidad_id,
              facultadId: sesion.facultad_id,
            }
          : null,
    }
  }

  // MT-04. Guarda en la sesión la universidad y la facultad en las que
  // trabaja el superadmin. Quien llama ya validó que existen y están
  // vigentes. Como sesionActiva, no usa consultarEnUniversidad: sesion_auth
  // no es una tabla institucional.
  async guardarEleccion(
    sid: string,
    usuarioId: string,
    eleccion: EleccionSuperadmin,
  ): Promise<void> {
    await this.bd.query(
      `UPDATE sesion_auth
          SET universidad_activa_id = $3, facultad_activa_id = $4
        WHERE id = $1 AND usuario_id = $2 AND revocado_en IS NULL`,
      [sid, usuarioId, eleccion.universidadId, eleccion.facultadId],
    )
  }

  // Usuario de la sesión para GET /api/auth/yo, o null si ya no existe en la
  // universidad del token.
  async obtenerUsuario(
    id: string,
    contexto: ContextoUniversidad,
  ): Promise<UsuarioSesion | null> {
    const [fila] = await this.bd.consultarEnUniversidad<FilaUsuario>(
      contexto,
      `SELECT u.id, u.nombre, u.correo, u.rol, u.universidad_id,
              un.nombre AS universidad_nombre, f.nombre AS facultad_nombre,
              u.credencial_provisoria
         FROM usuario u
         JOIN universidad un ON un.id = u.universidad_id
         LEFT JOIN facultad f ON f.id = u.facultad_id
        WHERE u.universidad_id = $1 AND u.id = $2`,
      [id],
    )
    if (!fila) {
      return null
    }
    return {
      id: fila.id,
      nombre: fila.nombre,
      correo: fila.correo,
      rol: fila.rol,
      universidadId: fila.universidad_id,
      universidadNombre:
        fila.rol === 'DIRECTOR' ? NOMBRE_DIRECTORIO : fila.universidad_nombre,
      facultadNombre: fila.facultad_nombre,
      debeCambiarPassword: fila.credencial_provisoria,
      periodoActivo: await this.periodoActivo(contexto),
    }
  }

  // MT-04. El superadmin de la sesión para GET /api/auth/yo, o null si ya no
  // existe. Sin universidad propia, muestra la que eligió (con su período
  // activo), o la plataforma mientras no elija una. Lee su fila como el
  // login: RLS no deja ver a un usuario sin universidad.
  async obtenerSuperadmin(
    id: string,
    contexto: ContextoUniversidad | null,
  ): Promise<UsuarioSesion | null> {
    const [fila] = await this.bd.query<
      Omit<FilaUsuario, 'universidad_id' | 'universidad_nombre'> & {
        universidad_id: string | null
        universidad_nombre: string | null
      }
    >(
      `SELECT u.id, u.nombre, u.correo, u.rol, un.id AS universidad_id,
              un.nombre AS universidad_nombre, f.nombre AS facultad_nombre,
              u.credencial_provisoria
         FROM usuario u
         LEFT JOIN universidad un ON un.id = $2
         LEFT JOIN facultad f ON f.id = $3
        WHERE u.id = $1 AND u.rol = 'SUPERADMIN' AND u.archived_at IS NULL`,
      [
        id,
        contexto?.universidadId ?? null,
        contexto?.superadmin?.facultadId ?? null,
      ],
    )
    if (!fila) {
      return null
    }
    return {
      id: fila.id,
      nombre: fila.nombre,
      correo: fila.correo,
      rol: fila.rol,
      universidadId: fila.universidad_id,
      universidadNombre: fila.universidad_nombre ?? NOMBRE_PLATAFORMA,
      facultadNombre: fila.facultad_nombre,
      debeCambiarPassword: fila.credencial_provisoria,
      periodoActivo: contexto ? await this.periodoActivo(contexto) : null,
    }
  }

  // Separada de obtenerUsuario porque GES-02 puede cambiar cómo se marca el
  // período activo.
  async periodoActivo(
    contexto: ContextoUniversidad,
  ): Promise<UsuarioSesion['periodoActivo']> {
    const [periodo] = await this.bd.consultarEnUniversidad<
      NonNullable<UsuarioSesion['periodoActivo']>
    >(
      contexto,
      `SELECT id, anio, semestre FROM periodo
        WHERE universidad_id = $1 AND activo`,
    )
    return periodo ?? null
  }
}
