import { PeriodosModule } from './periodos/periodos.module.js'
import { Module } from '@nestjs/common'
import { AppController } from './app.controller.js'
import { AppService } from './app.service.js'
import { AuthModule } from './auth/auth.module.js'
import { BaseDeDatosModule } from './database/base-de-datos.module.js'
import { GestionModule } from './gestion/gestion.module.js'
import { HealthModule } from './health/health.module.js'
import { CarrerasModule } from './carreras/carreras.module.js'

@Module({
  imports: [
    BaseDeDatosModule,
    AuthModule,
    GestionModule,
    HealthModule,
    CarrerasModule,
    PeriodosModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
