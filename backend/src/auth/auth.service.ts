import { createHash, randomBytes } from 'node:crypto'
import type { Rol, UsuarioSesion } from '@cursus/shared'
import { Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { hash, verify } from 'argon2'
import { duracionRefresh } from '../config/entorno.js'
import { BaseDeDatos } from '../database/base-de-datos.service.js'

// Contenido del JWT de sesión.
export interface PayloadJwt {
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
  ): Promise<TokensSesion | null> {
    // El correo es único por universidad, no global: la universidad se
    // identifica por el dominio del correo.
    const [usuario] = await this.bd.query<Credenciales>(
      `SELECT u.id, u.rol, u.universidad_id, u.password_hash
         FROM usuario u
         JOIN universidad un ON un.id = u.universidad_id
        WHERE lower(u.correo) = $1
          AND un.dominio_correo = split_part($1, '@', 2)`,
      [correo.trim().toLowerCase()],
    )
    const passwordValida = await verify(
      usuario?.password_hash ?? (await this.hashRelleno),
      password,
    )
    if (!usuario || !passwordValida) {
      return null
    }
    return this.emitirTokens(usuario)
  }

  // Rota el refresh token: lo revoca y emite uno nuevo junto a un JWT de
  // acceso. Devuelve null si el token no existe, expiró o ya estaba revocado.
  // Reusar un token ya revocado (por ejemplo, uno robado que ya se rotó)
  // revoca todas las sesiones de su usuario.
  async renovarSesion(refreshToken: string): Promise<TokensSesion | null> {
    const hashToken = hashDe(refreshToken)
    // El UPDATE es atómico: dos renovaciones simultáneas del mismo token no
    // pueden ganar las dos. Va en un CTE porque TypeORM devuelve [filas,
    // afectadas] para un UPDATE suelto.
    // Pendiente para MT-02: usuario aún no tiene archived_at; cuando exista,
    // un usuario archivado no debe poder renovar su sesión.
    const [usuario] = await this.bd.query<Omit<Credenciales, 'password_hash'>>(
      `WITH rotado AS (
         UPDATE refresh_token SET revocado_en = now()
          WHERE hash = $1 AND revocado_en IS NULL AND expira_en > now()
          RETURNING usuario_id
       )
       SELECT u.id, u.rol, u.universidad_id
         FROM rotado JOIN usuario u ON u.id = rotado.usuario_id`,
      [hashToken],
    )
    if (!usuario) {
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
    return this.emitirTokens(usuario)
  }

  // Revoca el refresh token, si sigue activo. No avisa si no existía.
  async cerrarSesion(refreshToken: string): Promise<void> {
    await this.bd.query(
      `UPDATE refresh_token SET revocado_en = now()
        WHERE hash = $1 AND revocado_en IS NULL`,
      [hashDe(refreshToken)],
    )
  }

  private async emitirTokens(
    usuario: Omit<Credenciales, 'password_hash'>,
  ): Promise<TokensSesion> {
    const refreshToken = randomBytes(32).toString('base64url')
    await this.bd.query(
      `INSERT INTO refresh_token (usuario_id, hash, expira_en)
       VALUES ($1, $2, now() + make_interval(secs => $3))`,
      [usuario.id, hashDe(refreshToken), this.segundosRefresh],
    )
    const accessToken = await this.jwt.signAsync({
      sub: usuario.id,
      rol: usuario.rol,
      universidad_id: usuario.universidad_id,
    } satisfies PayloadJwt)
    return { accessToken, refreshToken }
  }

  // Usuario de la sesión para GET /api/auth/yo, o null si ya no existe.
  async obtenerUsuario(id: string): Promise<UsuarioSesion | null> {
    const [fila] = await this.bd.query<FilaUsuario>(
      `SELECT u.id, u.nombre, u.rol, u.universidad_id,
              un.nombre AS universidad_nombre, f.nombre AS facultad_nombre
         FROM usuario u
         JOIN universidad un ON un.id = u.universidad_id
         LEFT JOIN facultad f ON f.id = u.facultad_id
        WHERE u.id = $1`,
      [id],
    )
    if (!fila) {
      return null
    }
    return {
      id: fila.id,
      nombre: fila.nombre,
      rol: fila.rol,
      universidadId: fila.universidad_id,
      universidadNombre:
        fila.rol === 'DIRECTOR' ? NOMBRE_DIRECTORIO : fila.universidad_nombre,
      facultadNombre: fila.facultad_nombre,
      periodoActivo: await this.periodoActivo(fila.universidad_id),
    }
  }

  // Separada de obtenerUsuario porque GES-02 puede cambiar cómo se marca el
  // período activo.
  async periodoActivo(
    universidadId: string,
  ): Promise<UsuarioSesion['periodoActivo']> {
    const [periodo] = await this.bd.query<
      NonNullable<UsuarioSesion['periodoActivo']>
    >(
      `SELECT id, anio, semestre FROM periodo
        WHERE universidad_id = $1 AND activo`,
      [universidadId],
    )
    return periodo ?? null
  }
}
