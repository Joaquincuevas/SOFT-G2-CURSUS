import { Module } from '@nestjs/common'
import { GestionController } from './gestion.controller.js'
import { GestionService } from './gestion.service.js'
import { EdicionCursoService } from './edicion-curso.service.js'
import { CargaAlumnosService } from './carga-alumnos.service.js'
import { AyudantesController } from './ayudantes.controller.js'
import { AyudantesService } from './ayudantes.service.js'
import { AsignacionesController } from './asignaciones.controller.js'
import { AsignacionesService } from './asignaciones.service.js'

@Module({
  controllers: [GestionController, AyudantesController, AsignacionesController],
  providers: [
    GestionService,
    EdicionCursoService,
    CargaAlumnosService,
    AyudantesService,
    AsignacionesService,
  ],
})
export class GestionModule {}
