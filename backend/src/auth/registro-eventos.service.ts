import { Injectable, Logger } from '@nestjs/common'
import { BaseDeDatos } from '../database/base-de-datos.service.js'

export type ResultadoInicioSesion = 'EXITOSO' | 'FALLIDO' | 'BLOQUEADO'

// SEG-04: registro de eventos de acceso. Lo escribe registrar_inicio_sesion
// (SECURITY DEFINER). Un éxito lleva el id de la cuenta que resolvió el login
// (no se vuelve a buscar por correo). Un fallo lleva el correo digitado solo
// para que la base resuelva la cuenta; nunca lo guarda.
export type CuentaDelIntento = { usuarioId: string } | { correo: string }

@Injectable()
export class RegistroEventos {
  private readonly logger = new Logger(RegistroEventos.name)

  constructor(private readonly bd: BaseDeDatos) {}

  // Nunca lanza: un fallo al registrar no debe tumbar ni cambiar la respuesta
  // del login. El log lleva un mensaje fijo, el resultado y el SQLSTATE: el
  // texto del error viene del driver y puede traer lo digitado.
  async inicioSesion(
    cuenta: CuentaDelIntento,
    ip: string | null,
    resultado: ResultadoInicioSesion,
  ): Promise<void> {
    const [correo, usuarioId] =
      'usuarioId' in cuenta ? [null, cuenta.usuarioId] : [cuenta.correo, null]
    try {
      await this.bd.query(
        'SELECT public.registrar_inicio_sesion($1, $2::inet, $3, $4::uuid)',
        [correo, ip, resultado, usuarioId],
      )
    } catch (error) {
      const { code } = error as { code?: unknown }
      this.logger.error(
        `No se pudo registrar el inicio de sesión ${resultado} (SQLSTATE ${typeof code === 'string' ? code : 'desconocido'})`,
      )
    }
  }
}
