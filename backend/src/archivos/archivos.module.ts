import { Module } from '@nestjs/common'
import { EspacioModule } from '../espacio/espacio.module.js'
import { AlmacenamientoService } from './almacenamiento.service.js'
import { ArchivosController } from './archivos.controller.js'
import { ArchivosService } from './archivos.service.js'

// MAT-01. Importa EspacioModule por IntegranteSeccionGuard (ESP-06). Exporta
// ArchivosService y AlmacenamientoService para el sílabo, los materiales y las
// entregas (MAT-02, MAT-04 y MAT-09).
@Module({
  imports: [EspacioModule],
  controllers: [ArchivosController],
  providers: [ArchivosService, AlmacenamientoService],
  exports: [ArchivosService, AlmacenamientoService],
})
export class ArchivosModule {}
