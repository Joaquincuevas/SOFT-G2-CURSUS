import { Module } from '@nestjs/common'
import { MfaController } from './mfa.controller.js'
import { MfaService } from './mfa.service.js'

// Épica de seguridad (F6). SEG-01: activación del MFA desde el perfil.
@Module({ controllers: [MfaController], providers: [MfaService] })
export class SeguridadModule {}
