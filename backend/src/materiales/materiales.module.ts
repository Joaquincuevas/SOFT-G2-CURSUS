import { Module } from '@nestjs/common'
import { EspacioModule } from '../espacio/espacio.module.js'
import { ActividadesController } from './actividades.controller.js'
import { ActividadesService } from './actividades.service.js'
import { SilaboController } from './silabo.controller.js'
import { SilaboService } from './silabo.service.js'

// Materiales (F4). Importa EspacioModule por IntegranteSeccionGuard.
@Module({
  imports: [EspacioModule],
  controllers: [ActividadesController, SilaboController],
  providers: [ActividadesService, SilaboService],
})
export class MaterialesModule {}
