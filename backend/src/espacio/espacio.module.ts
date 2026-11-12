import { Module } from '@nestjs/common'
import { AccesoSeccionService } from './acceso-seccion.service.js'
import { AlumnosSeccionService } from './alumnos-seccion.service.js'
import { EspacioController } from './espacio.controller.js'
import { IntegranteSeccionGuard } from './integrante-seccion.guard.js'
import { ResumenSeccionService } from './resumen-seccion.service.js'

@Module({
  controllers: [EspacioController],
  providers: [
    AccesoSeccionService,
    AlumnosSeccionService,
    IntegranteSeccionGuard,
    ResumenSeccionService,
  ],
  // Para las rutas del espacio en otros módulos (notas, asistencia): importan
  // EspacioModule y usan @IntegranteDeSeccion() con la misma instancia.
  exports: [AccesoSeccionService, IntegranteSeccionGuard],
})
export class EspacioModule {}
