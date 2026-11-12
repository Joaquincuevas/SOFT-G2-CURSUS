import { Module } from '@nestjs/common'
import { EspacioModule } from '../espacio/espacio.module.js'
import {
  AsistenciaController,
  AsistenciaPropiaController,
} from './asistencia.controller.js'
import { AsistenciaService } from './asistencia.service.js'
import { ClasesController } from './clases.controller.js'
import { ClasesService } from './clases.service.js'
import { ResumenAsistenciaController } from './resumen-asistencia.controller.js'
import { ResumenAsistenciaService } from './resumen-asistencia.service.js'

// Asistencia (F4). Importa EspacioModule por IntegranteSeccionGuard.
@Module({
  imports: [EspacioModule],
  controllers: [
    ClasesController,
    AsistenciaController,
    AsistenciaPropiaController,
    ResumenAsistenciaController,
  ],
  providers: [ClasesService, AsistenciaService, ResumenAsistenciaService],
})
export class AsistenciaModule {}
