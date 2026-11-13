import { createHash, randomBytes } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { hash } from 'argon2'
import { BaseDeDatos } from '../database/base-de-datos.service.js'
import { CorreoRecuperacion } from './correo-recuperacion.service.js'
import { LimiteLogin } from './limite-login.service.js'

const digest = (token: string) =>
  createHash('sha256').update(token).digest('hex')

@Injectable()
export class RecuperacionService {
  constructor(
    private readonly bd: BaseDeDatos,
    private readonly limite: LimiteLogin,
    private readonly correo: CorreoRecuperacion,
  ) {}

  async solicitar(direccion: string, ip: string | null): Promise<void> {
    const normalizada = direccion.trim().toLowerCase()
    const token = randomBytes(32).toString('hex')
    const { resultado } = await this.limite.intentar(
      normalizada,
      ip,
      async (tx) => {
        const [usuario] = await tx.query<{ correo: string }>(
          `WITH cuenta AS (
           SELECT u.id, u.correo, sha256(convert_to(u.password_hash, 'UTF8')) AS credencial
             FROM usuario u JOIN universidad un ON un.id = u.universidad_id
            WHERE lower(u.correo) = $1 AND un.dominio_correo = split_part($1, '@', 2)
              AND u.archived_at IS NULL AND un.archived_at IS NULL
            FOR UPDATE OF u
         ), emitida AS (
           INSERT INTO recuperacion_password (usuario_id, hash, credencial, expira_en)
           SELECT id, $2, credencial, clock_timestamp() + interval '30 minutes' FROM cuenta
           ON CONFLICT (usuario_id) DO UPDATE SET hash = EXCLUDED.hash,
             credencial = EXCLUDED.credencial, expira_en = EXCLUDED.expira_en
           WHERE recuperacion_password.expira_en <= clock_timestamp()
              OR recuperacion_password.credencial <> EXCLUDED.credencial
           RETURNING usuario_id
         )
         SELECT correo FROM cuenta JOIN emitida ON emitida.usuario_id = cuenta.id`,
          [normalizada, digest(token)],
        )
        // Se contabilizan todas las solicitudes, aunque no exista una cuenta.
        return { correo: usuario?.correo }
      },
      'recuperacion',
    )
    if (
      resultado?.correo &&
      !(await this.correo.enviar(resultado.correo, token))
    ) {
      await this.bd.query('DELETE FROM recuperacion_password WHERE hash = $1', [
        digest(token),
      ])
    }
  }

  async restablecer(token: string, password: string): Promise<boolean> {
    const clave = digest(token)
    return this.bd.enTransaccion(async (tx) => {
      const [usuario] = await tx.query<{ id: string }>(
        `SELECT u.id FROM recuperacion_password r JOIN usuario u ON u.id = r.usuario_id
           JOIN universidad un ON un.id = u.universidad_id
          WHERE r.hash = $1 AND r.expira_en > clock_timestamp()
            AND u.archived_at IS NULL AND un.archived_at IS NULL
          FOR UPDATE OF u`,
        [clave],
      )
      if (!usuario) return false
      const [consumido] = await tx.query<{ id: string }>(
        `WITH usado AS (
           DELETE FROM recuperacion_password r USING usuario u
            WHERE r.usuario_id = $1 AND r.hash = $2 AND u.id = r.usuario_id
              AND r.credencial = sha256(convert_to(u.password_hash, 'UTF8'))
              AND r.expira_en > clock_timestamp()
           RETURNING u.id
         ) SELECT id FROM usado`,
        [usuario.id, clave],
      )
      if (!consumido) return false
      await tx.query(
        'UPDATE usuario SET password_hash = $2, credencial_provisoria = false WHERE id = $1',
        [usuario.id, await hash(password)],
      )
      await tx.query(
        'UPDATE sesion_auth SET revocado_en = now() WHERE usuario_id = $1 AND revocado_en IS NULL',
        [usuario.id],
      )
      await tx.query(
        'UPDATE refresh_token SET revocado_en = now() WHERE usuario_id = $1 AND revocado_en IS NULL',
        [usuario.id],
      )
      return true
    })
  }
}
