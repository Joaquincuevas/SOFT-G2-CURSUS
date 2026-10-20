import type { HorarioSeccion } from '@cursus/shared'
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  Req,
} from '@nestjs/common'
import type { RequestConUsuario } from '../auth/jwt-auth.guard.js'
import { Puede } from '../auth/permisos.decorator.js'
import { UniversidadActual } from '../auth/universidad-actual.decorator.js'
import type { ContextoUniversidad } from '../database/base-de-datos.service.js'
import { GuardarHorarioDto } from './guardar-horario.dto.js'
import { HorariosService } from './horarios.service.js'

@Controller('secciones/:id/horario')
export class HorariosController {
  constructor(private readonly horarios: HorariosService) {}

  // El Director consulta el resumen en el detalle, sin acceso al editor.
  @Puede('update', 'Seccion')
  @Get()
  obtener(
    @UniversidadActual() contexto: ContextoUniversidad,
    @Req() req: RequestConUsuario,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<HorarioSeccion> {
    return this.horarios.obtener(contexto, req.usuario!.sub, id)
  }

  @Puede('update', 'Seccion')
  @Put()
  guardar(
    @UniversidadActual() contexto: ContextoUniversidad,
    @Req() req: RequestConUsuario,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() datos: GuardarHorarioDto,
  ): Promise<HorarioSeccion> {
    return this.horarios.guardar(contexto, req.usuario!.sub, id, datos)
  }
}
