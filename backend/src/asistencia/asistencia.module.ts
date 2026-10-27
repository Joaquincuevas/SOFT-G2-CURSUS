import { Module } from '@nestjs/common'
import { EspacioModule } from '../espacio/espacio.module.js'
import { AsistenciaController } from './asistencia.controller.js'
import { AsistenciaService } from './asistencia.service.js'
import { ClasesController } from './clases.controller.js'
import { ClasesService } from './clases.service.js'

// Asistencia (F4). Importa EspacioModule por IntegranteSeccionGuard.
@Module({
  imports: [EspacioModule],
  controllers: [ClasesController, AsistenciaController],
  providers: [ClasesService, AsistenciaService],
})
export class AsistenciaModule {}
