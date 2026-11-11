import type {
  ProfesorAsignable,
  ProfesorQuitado,
  ProfesorResumen,
} from '@cursus/shared'
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common'
import type { RequestConUsuario } from '../auth/jwt-auth.guard.js'
import { Puede } from '../auth/permisos.decorator.js'
import { UniversidadActual } from '../auth/universidad-actual.decorator.js'
import type { ContextoUniversidad } from '../database/base-de-datos.service.js'
import { AsignacionesService } from './asignaciones.service.js'
import { AsignarProfesorDto } from './asignar-profesor.dto.js'
import { ProfesoresService } from './profesores.service.js'
import { QuitarAsignacionDto } from './quitar-asignacion.dto.js'

// GES-25: varios profesores por sección, con el mismo permiso que asignar
// ayudantes (GES-13) y quitar (GES-14).
@Controller('secciones/:id/profesores')
export class ProfesoresController {
  constructor(
    private readonly profesores: ProfesoresService,
    private readonly asignaciones: AsignacionesService,
  ) {}

  @Puede('update', 'Seccion')
  @Get()
  listar(
    @UniversidadActual() contexto: ContextoUniversidad,
    @Req() req: RequestConUsuario,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ProfesorAsignable[]> {
    return this.profesores.listar(contexto, req.usuario!.sub, id)
  }

  @Puede('update', 'Seccion')
  @Post()
  @HttpCode(200)
  agregar(
    @UniversidadActual() contexto: ContextoUniversidad,
    @Req() req: RequestConUsuario,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() { profesorId }: AsignarProfesorDto,
  ): Promise<ProfesorResumen[]> {
    return this.profesores.agregar(contexto, req.usuario!.sub, id, profesorId)
  }

  @Puede('update', 'Seccion')
  @Patch(':usuarioId/quitar')
  quitar(
    @UniversidadActual() contexto: ContextoUniversidad,
    @Req() req: RequestConUsuario,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('usuarioId', ParseUUIDPipe) usuarioId: string,
    @Body() { motivo }: QuitarAsignacionDto,
  ): Promise<ProfesorQuitado> {
    return this.asignaciones.quitarUnProfesor(
      contexto,
      req.usuario!.sub,
      id,
      usuarioId,
      motivo,
    )
  }
}
