import { PeriodosModule } from './periodos/periodos.module.js'
import { Module } from '@nestjs/common'
import { AppController } from './app.controller.js'
import { AppService } from './app.service.js'
import { AuthModule } from './auth/auth.module.js'
import { BaseDeDatosModule } from './database/base-de-datos.module.js'
import { GestionModule } from './gestion/gestion.module.js'
import { HealthModule } from './health/health.module.js'
import { CarrerasModule } from './carreras/carreras.module.js'
import { PerfilModule } from './perfil/perfil.module.js'
import { EspacioModule } from './espacio/espacio.module.js'
import { DashboardModule } from './dashboard/dashboard.module.js'
import { AsistenciaModule } from './asistencia/asistencia.module.js'
import { NotasModule } from './notas/notas.module.js'
import { AnunciosModule } from './anuncios/anuncios.module.js'

@Module({
  imports: [
    BaseDeDatosModule,
    AuthModule,
    GestionModule,
    HealthModule,
    CarrerasModule,
    PeriodosModule,
    PerfilModule,
    EspacioModule,
    DashboardModule,
    AsistenciaModule,
    NotasModule,
    AnunciosModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
