import { randomBytes } from 'node:crypto'
import type { Rol } from '@cursus/shared'
import { Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { hash, verify } from 'argon2'
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

@Injectable()
export class AuthService {
  // Si el correo no existe se verifica igual contra este hash, para que el
  // tiempo de respuesta no revele qué correos están registrados.
  private readonly hashRelleno = hash(randomBytes(32).toString('hex'))

  constructor(
    private readonly bd: BaseDeDatos,
    private readonly jwt: JwtService,
  ) {}

  // Devuelve el JWT de sesión, o null si las credenciales no son válidas.
  async iniciarSesion(
    correo: string,
    password: string,
  ): Promise<string | null> {
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
    return this.jwt.signAsync({
      sub: usuario.id,
      rol: usuario.rol,
      universidad_id: usuario.universidad_id,
    } satisfies PayloadJwt)
  }
}
