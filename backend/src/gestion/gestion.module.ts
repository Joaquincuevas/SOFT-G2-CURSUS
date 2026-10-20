import { Module } from '@nestjs/common'
import { GestionController } from './gestion.controller.js'
import { GestionService } from './gestion.service.js'
import { EdicionCursoService } from './edicion-curso.service.js'
import { CargaAlumnosService } from './carga-alumnos.service.js'

@Module({
  controllers: [GestionController],
  providers: [GestionService, EdicionCursoService, CargaAlumnosService],
})
export class GestionModule {}
