import type { EstadoMfa, InicioMfa } from '@cursus/shared'
import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common'
import { toString as qrSvg } from 'qrcode'
import { secretoMfa } from '../config/entorno.js'
import { BaseDeDatos } from '../database/base-de-datos.service.js'
import {
  cifrarSecretoTotp,
  descifrarSecretoTotp,
  llaveMfa,
} from './cifrado-mfa.js'
import { generarSecretoTotp, pasoDelCodigo, uriTotp } from './totp.js'

// SEG-01. Activación del MFA desde el perfil, para todos los roles: como la
// contraseña (PER-02), es una credencial y no un dato académico, así que
// también la activa el Director (ADR 0001). mfa_usuario no es una tabla
// institucional: igual que el cambio de contraseña, no usa
// consultarEnUniversidad y solo toca la fila del id del JWT.
//
// El paso siguiente, pedir el código al iniciar sesión, es SEG-02: esta
// tarjeta solo deja el MFA activo.
@Injectable()
export class MfaService {
  // Se deriva una vez: MFA_SECRET no cambia mientras la API corre. Se lee al
  // crear el servicio, para que un valor inválido falle al arrancar.
  private readonly llave: Buffer | null

  constructor(private readonly bd: BaseDeDatos) {
    const secreto = secretoMfa()
    this.llave = secreto ? llaveMfa(secreto) : null
  }

  async estado(usuarioId: string): Promise<EstadoMfa> {
    const [fila] = await this.bd.query<{ activo: boolean }>(
      `SELECT m.activado_en IS NOT NULL AS activo
         FROM mfa_usuario m
         JOIN usuario u ON u.id = m.usuario_id AND u.archived_at IS NULL
        WHERE m.usuario_id = $1`,
      [usuarioId],
    )
    return { activo: fila?.activo ?? false }
  }

  // Genera un secreto nuevo y lo deja pendiente hasta que el usuario confirme
  // un código. Si ya había uno pendiente (por ejemplo, cerró el QR sin
  // confirmar), se reemplaza: el QR anterior deja de servir.
  async iniciar(usuarioId: string): Promise<InicioMfa> {
    const llave = this.llaveDisponible()
    const [usuario] = await this.bd.query<{ correo: string }>(
      `SELECT correo FROM usuario WHERE id = $1 AND archived_at IS NULL`,
      [usuarioId],
    )
    if (!usuario) {
      throw new UnauthorizedException()
    }

    const secreto = generarSecretoTotp()
    // El WHERE del ON CONFLICT no pisa un MFA ya activo, ni siquiera si se
    // activó en otra pestaña entre medio: sin fila, responde 409.
    const [guardado] = await this.bd.query<{ usuario_id: string }>(
      `INSERT INTO mfa_usuario (usuario_id, secreto_cifrado)
       VALUES ($1, $2)
       ON CONFLICT (usuario_id) DO UPDATE
          SET secreto_cifrado = EXCLUDED.secreto_cifrado, creado_en = now()
        WHERE mfa_usuario.activado_en IS NULL
       RETURNING usuario_id`,
      [usuarioId, cifrarSecretoTotp(llave, usuarioId, secreto)],
    )
    if (!guardado) {
      throw new ConflictException('La verificación en dos pasos ya está activa')
    }

    const uri = uriTotp(usuario.correo, secreto)
    return {
      secreto,
      uri,
      qr: await qrSvg(uri, { type: 'svg', errorCorrectionLevel: 'M' }),
    }
  }

  // Activa el MFA si el código calza con el secreto pendiente.
  async confirmar(usuarioId: string, codigo: string): Promise<void> {
    const llave = this.llaveDisponible()
    const [fila] = await this.bd.query<{
      secreto_cifrado: string
      activo: boolean
    }>(
      `SELECT m.secreto_cifrado, m.activado_en IS NOT NULL AS activo
         FROM mfa_usuario m
         JOIN usuario u ON u.id = m.usuario_id AND u.archived_at IS NULL
        WHERE m.usuario_id = $1`,
      [usuarioId],
    )
    if (fila?.activo) {
      throw new ConflictException('La verificación en dos pasos ya está activa')
    }
    if (!fila) {
      throw new BadRequestException('Primero genera el código QR')
    }

    const secreto = descifrarSecretoTotp(llave, usuarioId, fila.secreto_cifrado)
    const paso = pasoDelCodigo(secreto, codigo)
    if (paso === null) {
      throw new BadRequestException('El código no es válido')
    }

    // Activa justo el secreto que se verificó: si en otra pestaña se generó
    // un QR nuevo entre medio, este código ya no corresponde.
    const [activado] = await this.bd.query<{ usuario_id: string }>(
      `WITH activado AS (
         UPDATE mfa_usuario SET activado_en = now(), ultimo_paso = $3
          WHERE usuario_id = $1 AND secreto_cifrado = $2
            AND activado_en IS NULL
          RETURNING usuario_id
       )
       SELECT usuario_id FROM activado`,
      // El código con que se confirma ya se usó: no sirve para iniciar sesión.
      [usuarioId, fila.secreto_cifrado, paso],
    )
    if (!activado) {
      throw new ConflictException(
        'El código QR cambió. Escanea el más reciente e intenta de nuevo.',
      )
    }
  }

  // SEG-02. null si la cuenta no tiene MFA activo; si lo tiene, el último
  // paso TOTP aceptado (null si todavía no se usó ninguno). Corre con la
  // conexión del login (la transacción del límite de intentos).
  async estadoParaLogin(
    usuarioId: string,
    bd: Pick<BaseDeDatos, 'query'> = this.bd,
  ): Promise<{ ultimoPaso: number | null } | null> {
    const [fila] = await bd.query<{ ultimo_paso: number | null }>(
      `SELECT ultimo_paso FROM mfa_usuario
        WHERE usuario_id = $1 AND activado_en IS NOT NULL`,
      [usuarioId],
    )
    return fila ? { ultimoPaso: fila.ultimo_paso } : null
  }

  // SEG-02. Verifica el código del login y consume su paso: true solo si el
  // código es válido en la ventana de ±1 paso, su paso es posterior al último
  // aceptado y la cuenta sigue en el mismo estado que cuando se emitió el
  // desafío (ultimoPasoDelDesafio). El UPDATE es atómico: dos peticiones con
  // el mismo código no pueden ganar las dos. Falla cerrado: sin MFA_SECRET, o
  // con un secreto que no se puede descifrar, es false (nunca una sesión).
  async verificarParaLogin(
    usuarioId: string,
    codigo: string,
    ultimoPasoDelDesafio: number | null,
    bd: Pick<BaseDeDatos, 'query'> = this.bd,
  ): Promise<boolean> {
    if (!this.llave) return false
    const [fila] = await bd.query<{
      secreto_cifrado: string
      ultimo_paso: number | null
    }>(
      `SELECT m.secreto_cifrado, m.ultimo_paso
         FROM mfa_usuario m
         JOIN usuario u ON u.id = m.usuario_id AND u.archived_at IS NULL
        WHERE m.usuario_id = $1 AND m.activado_en IS NOT NULL`,
      [usuarioId],
    )
    if (!fila || fila.ultimo_paso !== ultimoPasoDelDesafio) return false
    let paso: number | null
    try {
      paso = pasoDelCodigo(
        descifrarSecretoTotp(this.llave, usuarioId, fila.secreto_cifrado),
        codigo,
      )
    } catch {
      return false
    }
    if (
      paso === null ||
      (fila.ultimo_paso !== null && paso <= fila.ultimo_paso)
    ) {
      return false
    }
    const [consumido] = await bd.query<{ usuario_id: string }>(
      `UPDATE mfa_usuario SET ultimo_paso = $2
        WHERE usuario_id = $1 AND activado_en IS NOT NULL
          AND ultimo_paso IS NOT DISTINCT FROM $3
        RETURNING usuario_id`,
      [usuarioId, paso, ultimoPasoDelDesafio],
    )
    return consumido !== undefined
  }

  private llaveDisponible(): Buffer {
    if (!this.llave) {
      throw new ServiceUnavailableException(
        'La verificación en dos pasos no está disponible',
      )
    }
    return this.llave
  }
}
