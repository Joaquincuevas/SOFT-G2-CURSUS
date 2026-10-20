import type { AsignacionQuitada, AyudanteQuitado } from '@cursus/shared'
import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Patch,
  Req,
} from '@nestjs/common'
import type { RequestConUsuario } from '../auth/jwt-auth.guard.js'
import { Puede } from '../auth/permisos.decorator.js'
import { UniversidadActual } from '../auth/universidad-actual.decorator.js'
import type { ContextoUniversidad } from '../database/base-de-datos.service.js'
import { AsignacionesService } from './asignaciones.service.js'
import {
  QuitarAsignacionDto,
  QuitarProfesorDto,
} from './quitar-asignacion.dto.js'

// GES-14. Quitar es un PATCH y no un DELETE: nada se elimina (el rol de la
// API no tiene DELETE). Mismo permiso que asignar (GES-12 y GES-13).
@Controller('secciones/:id')
export class AsignacionesController {
  constructor(private readonly asignaciones: AsignacionesService) {}

  @Puede('update', 'Seccion')
  @Patch('profesor/quitar')
  quitarProfesor(
    @UniversidadActual() contexto: ContextoUniversidad,
    @Req() req: RequestConUsuario,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() { motivo, profesorId }: QuitarProfesorDto,
  ): Promise<AsignacionQuitada> {
    return this.asignaciones.quitarProfesor(
      contexto,
      req.usuario!.sub,
      id,
      profesorId,
      motivo,
    )
  }

  @Puede('update', 'Seccion')
  @Patch('ayudantes/:usuarioId/quitar')
  quitarAyudante(
    @UniversidadActual() contexto: ContextoUniversidad,
    @Req() req: RequestConUsuario,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('usuarioId', ParseUUIDPipe) usuarioId: string,
    @Body() { motivo }: QuitarAsignacionDto,
  ): Promise<AyudanteQuitado> {
    return this.asignaciones.quitarAyudante(
      contexto,
      req.usuario!.sub,
      id,
      usuarioId,
      motivo,
    )
  }
}
