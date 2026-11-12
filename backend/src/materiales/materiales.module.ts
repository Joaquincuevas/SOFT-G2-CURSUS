import { Module } from '@nestjs/common'
import { ArchivosModule } from '../archivos/archivos.module.js'
import { EspacioModule } from '../espacio/espacio.module.js'
import { ActividadesController } from './actividades.controller.js'
import { ActividadesService } from './actividades.service.js'
import { SilaboVigenteController } from './silabo-vigente.controller.js'
import { SilaboVigenteService } from './silabo-vigente.service.js'
import { EntregasController } from './entregas.controller.js'
import { EntregasService } from './entregas.service.js'
import { MaterialesController } from './materiales.controller.js'
import { MaterialesService } from './materiales.service.js'
import { SilaboController } from './silabo.controller.js'
import { SilaboService } from './silabo.service.js'

// Materiales (F4). Importa EspacioModule por IntegranteSeccionGuard.
@Module({
  imports: [EspacioModule, ArchivosModule],
  controllers: [
    ActividadesController,
    EntregasController,
    MaterialesController,
    SilaboController,
    SilaboVigenteController,
  ],
  providers: [
    ActividadesService,
    EntregasService,
    MaterialesService,
    SilaboService,
    SilaboVigenteService,
  ],
})
export class MaterialesModule {}
