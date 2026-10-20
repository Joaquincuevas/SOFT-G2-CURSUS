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

// Contenido del JWT de sesión.
export interface PayloadJwt {
  sid?: string
  sub: string
  rol: Rol
  universidad_id: string
}

interface Credenciales {
  id: string
  rol: Rol
  universidad_id: string
  password_hash: string
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
}

// El Director ve todas las universidades: el Figma lo muestra como "Directorio".
const NOMBRE_DIRECTORIO = 'Directorio'

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
    // Un usuario archivado responde igual que uno que no existe.
    const [usuario] = await bd.query<Credenciales>(
      `SELECT u.id, u.rol, u.universidad_id, u.password_hash
         FROM usuario u
         JOIN universidad un ON un.id = u.universidad_id
        WHERE lower(u.correo) = $1
          AND un.dominio_correo = split_part($1, '@', 2)
          AND u.archived_at IS NULL`,
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

  // También corta la sesión de un usuario archivado, sin esperar a que venza
  // su JWT.
  async sesionActiva(sid: string, usuarioId: string): Promise<boolean> {
    const [sesion] = await this.bd.query<{ id: string }>(
      `SELECT s.id FROM sesion_auth s
         JOIN usuario u ON u.id = s.usuario_id
        WHERE s.id::text = $1 AND s.usuario_id::text = $2
          AND s.revocado_en IS NULL AND u.archived_at IS NULL`,
      [sid, usuarioId],
    )
    return !!sesion
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
              un.nombre AS universidad_nombre, f.nombre AS facultad_nombre
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
      periodoActivo: await this.periodoActivo(contexto),
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
