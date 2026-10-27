import { Module } from '@nestjs/common'
import { EspacioModule } from '../espacio/espacio.module.js'
import { EvaluacionesController } from './evaluaciones.controller.js'
import { EvaluacionesService } from './evaluaciones.service.js'

// Notas (F4). Importa EspacioModule por IntegranteSeccionGuard.
@Module({
  imports: [EspacioModule],
  controllers: [EvaluacionesController],
  providers: [EvaluacionesService],
})
export class NotasModule {}
