import { Module } from '@nestjs/common'
import { AppController } from './app.controller.js'
import { AppService } from './app.service.js'
import { AuthModule } from './auth/auth.module.js'
import { BaseDeDatosModule } from './database/base-de-datos.module.js'
import { HealthModule } from './health/health.module.js'

@Module({
  imports: [BaseDeDatosModule, AuthModule, HealthModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
