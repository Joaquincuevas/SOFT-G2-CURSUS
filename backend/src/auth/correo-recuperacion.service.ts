import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2'
import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common'

@Injectable()
export class CorreoRecuperacion implements OnModuleDestroy {
  private cliente?: SESv2Client
  private readonly logger = new Logger(CorreoRecuperacion.name)

  async enviar(correo: string, token: string): Promise<boolean> {
    const origen = process.env.RECUPERACION_ORIGEN
    const remitente = process.env.RECUPERACION_REMITENTE
    try {
      if (!origen || !remitente) throw new Error()
      const url = new URL('/restablecer-password', origen)
      if (url.protocol !== 'https:' && url.origin !== 'http://localhost:5173')
        throw new Error()
      url.hash = token
      this.cliente ??= new SESv2Client({ maxAttempts: 1 })
      await this.cliente.send(
        new SendEmailCommand({
          FromEmailAddress: remitente,
          Destination: { ToAddresses: [correo] },
          Content: {
            Simple: {
              Subject: {
                Data: 'Recupera tu contraseña de CURSUS',
                Charset: 'UTF-8',
              },
              Body: {
                Text: {
                  Data: `Abre este enlace para definir tu nueva contraseña. Expira en 30 minutos.\n\n${url.href}\n\nSi no solicitaste el cambio, ignora este mensaje.`,
                  Charset: 'UTF-8',
                },
              },
            },
          },
        }),
        { abortSignal: AbortSignal.timeout(2200) },
      )
      return true
    } catch {
      this.logger.warn('No se pudo enviar un correo de recuperación')
      return false
    }
  }

  onModuleDestroy() {
    this.cliente?.destroy()
  }
}
