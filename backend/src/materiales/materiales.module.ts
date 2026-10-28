import { Module } from '@nestjs/common'
import { EspacioModule } from '../espacio/espacio.module.js'
import { ActividadesController } from './actividades.controller.js'
import { ActividadesService } from './actividades.service.js'

// Materiales (F4). Importa EspacioModule por IntegranteSeccionGuard.
@Module({
  imports: [EspacioModule],
  controllers: [ActividadesController],
  providers: [ActividadesService],
})
export class MaterialesModule {}
