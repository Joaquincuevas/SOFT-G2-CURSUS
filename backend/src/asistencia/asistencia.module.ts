import { Module } from '@nestjs/common'
import { EspacioModule } from '../espacio/espacio.module.js'
import { ClasesController } from './clases.controller.js'
import { ClasesService } from './clases.service.js'

// Asistencia (F4). Importa EspacioModule por IntegranteSeccionGuard.
@Module({
  imports: [EspacioModule],
  controllers: [ClasesController],
  providers: [ClasesService],
})
export class AsistenciaModule {}
