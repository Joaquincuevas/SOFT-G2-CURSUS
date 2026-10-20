import { Module } from '@nestjs/common'
import { GestionController } from './gestion.controller.js'
import { GestionService } from './gestion.service.js'
import { EdicionCursoService } from './edicion-curso.service.js'
import { CargaAlumnosService } from './carga-alumnos.service.js'
import { AyudantesController } from './ayudantes.controller.js'
import { AyudantesService } from './ayudantes.service.js'
import { HorariosController } from './horarios.controller.js'
import { HorariosService } from './horarios.service.js'

@Module({
  controllers: [GestionController, AyudantesController, HorariosController],
  providers: [
    GestionService,
    EdicionCursoService,
    CargaAlumnosService,
    AyudantesService,
    HorariosService,
  ],
})
export class GestionModule {}
