import { Module } from '@nestjs/common'
import { EspacioModule } from '../espacio/espacio.module.js'
import { ActividadesController } from './actividades.controller.js'
import { ActividadesService } from './actividades.service.js'
import { ArchivosModule } from '../archivos/archivos.module.js'
import {
  EntregasController,
  EntregasDocentesController,
} from './entregas.controller.js'
import { EntregasService } from './entregas.service.js'
import { MaterialesController } from './materiales.controller.js'
import { MaterialesService } from './materiales.service.js'

// Materiales (F4). Importa EspacioModule por IntegranteSeccionGuard.
@Module({
  imports: [EspacioModule, ArchivosModule],
  controllers: [
    ActividadesController,
    EntregasController,
    EntregasDocentesController,
    MaterialesController,
  ],
  providers: [ActividadesService, EntregasService, MaterialesService],
})
export class MaterialesModule {}
