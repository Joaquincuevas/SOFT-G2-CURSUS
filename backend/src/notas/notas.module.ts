import { Module } from '@nestjs/common'
import { EspacioModule } from '../espacio/espacio.module.js'
import { AuditoriaNotasService } from './auditoria-notas.service.js'
import { EvaluacionesController } from './evaluaciones.controller.js'
import { EvaluacionesService } from './evaluaciones.service.js'
import { MisNotasController } from './mis-notas.controller.js'
import { MisNotasService } from './mis-notas.service.js'
import { NotasController } from './notas.controller.js'
import { NotasFinalesController } from './notas-finales.controller.js'
import { NotasFinalesService } from './notas-finales.service.js'
import { NotasService } from './notas.service.js'
import { PonderacionesService } from './ponderaciones.service.js'

// Notas (F4). Importa EspacioModule por IntegranteSeccionGuard. Exporta la
// auditoría (NOT-04) para que las tarjetas de notas la usen en su
// transacción.
@Module({
  imports: [EspacioModule],
  controllers: [
    EvaluacionesController,
    NotasController,
    MisNotasController,
    NotasFinalesController,
  ],
  providers: [
    EvaluacionesService,
    AuditoriaNotasService,
    MisNotasService,
    NotasFinalesService,
    NotasService,
    PonderacionesService,
  ],
  exports: [AuditoriaNotasService, PonderacionesService],
})
export class NotasModule {}
