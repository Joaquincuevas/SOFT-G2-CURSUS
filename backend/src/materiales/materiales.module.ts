import { Module } from '@nestjs/common'
import { ArchivosModule } from '../archivos/archivos.module.js'
import { EspacioModule } from '../espacio/espacio.module.js'
import { ActividadesController } from './actividades.controller.js'
import { ActividadesService } from './actividades.service.js'
import { SilaboVigenteController } from './silabo-vigente.controller.js'
import { SilaboVigenteService } from './silabo-vigente.service.js'

// Materiales (F4). Importa EspacioModule por IntegranteSeccionGuard.
@Module({
  imports: [EspacioModule, ArchivosModule],
  controllers: [ActividadesController, SilaboVigenteController],
  providers: [ActividadesService, SilaboVigenteService],
})
export class MaterialesModule {}
