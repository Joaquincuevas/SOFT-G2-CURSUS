import { Module } from '@nestjs/common'
import { EspacioModule } from '../espacio/espacio.module.js'
import { ActividadesController } from './actividades.controller.js'
import { ActividadesService } from './actividades.service.js'
import { ArchivosModule } from '../archivos/archivos.module.js'
import { EntregasController } from './entregas.controller.js'
import { EntregasService } from './entregas.service.js'

// Materiales (F4). Importa EspacioModule por IntegranteSeccionGuard.
@Module({
  imports: [EspacioModule, ArchivosModule],
  controllers: [ActividadesController, EntregasController],
  providers: [ActividadesService, EntregasService],
})
export class MaterialesModule {}
