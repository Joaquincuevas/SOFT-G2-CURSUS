import { Module } from '@nestjs/common'
import { EspacioModule } from '../espacio/espacio.module.js'
import { AuditoriaNotasService } from './auditoria-notas.service.js'
import { EvaluacionesController } from './evaluaciones.controller.js'
import { EvaluacionesService } from './evaluaciones.service.js'
import { NotasController } from './notas.controller.js'
import { NotasService } from './notas.service.js'

// Notas (F4). Importa EspacioModule por IntegranteSeccionGuard. Exporta la
// auditoría (NOT-04) para que las tarjetas de notas la usen en su
// transacción.
@Module({
  imports: [EspacioModule],
  controllers: [EvaluacionesController, NotasController],
  providers: [EvaluacionesService, AuditoriaNotasService, NotasService],
  exports: [AuditoriaNotasService],
})
export class NotasModule {}
