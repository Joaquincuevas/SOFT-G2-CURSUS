import type { AyudanteOpcion, AyudanteResumen } from '@cursus/shared'
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common'
import type { RequestConUsuario } from '../auth/jwt-auth.guard.js'
import { Puede } from '../auth/permisos.decorator.js'
import { UniversidadActual } from '../auth/universidad-actual.decorator.js'
import type { ContextoUniversidad } from '../database/base-de-datos.service.js'
import { AsignarAyudantesDto } from './asignar-ayudantes.dto.js'
import { AyudantesService } from './ayudantes.service.js'

@Controller('secciones/:id/ayudantes')
export class AyudantesController {
  constructor(private readonly ayudantes: AyudantesService) {}

  // Las opciones son para quien puede editar la sección. El Director lee
  // los nombres asignados en el detalle del curso, sin ofrecerle acciones.
  @Puede('update', 'Seccion')
  @Get()
  listar(
    @UniversidadActual() contexto: ContextoUniversidad,
    @Req() req: RequestConUsuario,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AyudanteOpcion[]> {
    return this.ayudantes.listar(contexto, req.usuario!.sub, id)
  }

  @Puede('update', 'Seccion')
  @Post()
  @HttpCode(200)
  asignar(
    @UniversidadActual() contexto: ContextoUniversidad,
    @Req() req: RequestConUsuario,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() datos: AsignarAyudantesDto,
  ): Promise<AyudanteResumen[]> {
    return this.ayudantes.asignar(contexto, req.usuario!.sub, id, datos)
  }
}
