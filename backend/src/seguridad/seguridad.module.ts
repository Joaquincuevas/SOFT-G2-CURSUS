import { Module } from '@nestjs/common'
import { MfaController } from './mfa.controller.js'
import { MfaService } from './mfa.service.js'

// Épica de seguridad (F6). SEG-01: activación del MFA desde el perfil.
// SEG-02: AuthModule usa MfaService para verificar el código al iniciar sesión.
@Module({
  controllers: [MfaController],
  providers: [MfaService],
  exports: [MfaService],
})
export class SeguridadModule {}
