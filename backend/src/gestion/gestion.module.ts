import { Module } from '@nestjs/common'
import { GestionController } from './gestion.controller.js'
import { GestionService } from './gestion.service.js'
import { EdicionCursoService } from './edicion-curso.service.js'
import { CargaAlumnosService } from './carga-alumnos.service.js'
import { AyudantesController } from './ayudantes.controller.js'
import { AyudantesService } from './ayudantes.service.js'

@Module({
  controllers: [GestionController, AyudantesController],
  providers: [
    GestionService,
    EdicionCursoService,
    CargaAlumnosService,
    AyudantesService,
  ],
})
export class GestionModule {}
