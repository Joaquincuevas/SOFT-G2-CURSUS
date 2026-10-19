import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { type JwtSignOptions, JwtModule } from '@nestjs/jwt'
import { duracionJwt, secretoJwt } from '../config/entorno.js'
import { AuthController } from './auth.controller.js'
import { AuthService } from './auth.service.js'
import { JwtAuthGuard } from './jwt-auth.guard.js'
import { PermisosGuard } from './permisos.guard.js'

@Module({
  imports: [
    // Se configura al arrancar, cuando el .env ya está cargado.
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: secretoJwt(),
        signOptions: {
          algorithm: 'HS256',
          expiresIn: duracionJwt() as JwtSignOptions['expiresIn'],
        },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    // Todas las rutas exigen sesión, salvo las marcadas con @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Corre después del JWT: cada ruta debe declarar quién puede usarla.
    { provide: APP_GUARD, useClass: PermisosGuard },
  ],
})
export class AuthModule {}
