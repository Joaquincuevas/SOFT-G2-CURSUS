import { Module } from '@nestjs/common'
import { AccesoSeccionService } from './acceso-seccion.service.js'
import { EspacioController } from './espacio.controller.js'
import { IntegranteSeccionGuard } from './integrante-seccion.guard.js'

@Module({
  controllers: [EspacioController],
  providers: [AccesoSeccionService, IntegranteSeccionGuard],
})
export class EspacioModule {}
