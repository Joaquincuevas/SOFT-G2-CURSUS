import { Module } from '@nestjs/common'
import { GestionController } from './gestion.controller.js'
import { GestionService } from './gestion.service.js'
import { EdicionCursoService } from './edicion-curso.service.js'
import { CargaAlumnosService } from './carga-alumnos.service.js'
import { AyudantesController } from './ayudantes.controller.js'
import { AyudantesService } from './ayudantes.service.js'
import { HorariosController } from './horarios.controller.js'
import { HorariosService } from './horarios.service.js'
import { AsignacionesController } from './asignaciones.controller.js'
import { AsignacionesService } from './asignaciones.service.js'

import { ProfesoresController } from './profesores.controller.js'
import { ProfesoresService } from './profesores.service.js'
import { IntegrantesController } from './integrantes.controller.js'
import { IntegrantesService } from './integrantes.service.js'
import { CursosArchivadosController } from './cursos-archivados.controller.js'

@Module({
  controllers: [
    CursosArchivadosController,
    IntegrantesController,
    GestionController,
    AyudantesController,
    HorariosController,
    AsignacionesController,
    ProfesoresController,
  ],
  providers: [
    IntegrantesService,
    GestionService,
    EdicionCursoService,
    CargaAlumnosService,
    AyudantesService,
    HorariosService,
    AsignacionesService,
    ProfesoresService,
  ],
})
export class GestionModule {}
