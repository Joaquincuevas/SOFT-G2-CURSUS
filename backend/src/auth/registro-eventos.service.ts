import { Injectable, Logger } from '@nestjs/common'
import { BaseDeDatos } from '../database/base-de-datos.service.js'

export type ResultadoInicioSesion = 'EXITOSO' | 'FALLIDO' | 'BLOQUEADO'

// SEG-04: registro de eventos de acceso. Lo escribe registrar_inicio_sesion
// (SECURITY DEFINER), que resuelve la cuenta dentro de la base y nunca guarda
// el correo digitado: aquí no se calcula ni se pasa ningún id de usuario.
@Injectable()
export class RegistroEventos {
  private readonly logger = new Logger(RegistroEventos.name)

  constructor(private readonly bd: BaseDeDatos) {}

  // Nunca lanza: un fallo al registrar no debe tumbar ni cambiar la respuesta
  // del login. Queda en el log del servidor, sin el correo ni los parámetros
  // de la consulta (el error de TypeORM los trae).
  async inicioSesion(
    correo: string,
    ip: string | null,
    resultado: ResultadoInicioSesion,
  ): Promise<void> {
    try {
      await this.bd.query(
        'SELECT public.registrar_inicio_sesion($1, $2::inet, $3)',
        [correo, ip, resultado],
      )
    } catch (error) {
      const { code, message } = error as { code?: string; message?: string }
      this.logger.error(
        `No se pudo registrar el inicio de sesión ${resultado}: ${code ?? 'sin código'} ${message ?? ''}`.trim(),
      )
    }
  }
}
