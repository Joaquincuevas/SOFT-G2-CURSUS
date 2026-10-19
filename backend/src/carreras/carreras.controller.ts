import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common'
import { Puede } from '../auth/permisos.decorator.js'
import { UniversidadActual } from '../auth/universidad-actual.decorator.js'
import type { RequestConUsuario } from '../auth/jwt-auth.guard.js'
import type { ContextoUniversidad } from '../database/base-de-datos.service.js'
import { CarrerasService } from './carreras.service.js'
import { NombreCarreraDto } from './nombre-carrera.dto.js'

@Controller('carreras')
export class CarrerasController {
  constructor(private readonly carreras: CarrerasService) {}

  private usuario(req: RequestConUsuario): string {
    if (!req.usuario) throw new UnauthorizedException()
    return req.usuario.sub
  }

  @Puede('read', 'Carrera')
  @Get()
  listar(
    @UniversidadActual() contexto: ContextoUniversidad,
    @Req() req: RequestConUsuario,
  ) {
    return this.carreras.listar(contexto, this.usuario(req))
  }

  @Puede('create', 'Carrera')
  @Post()
  crear(
    @UniversidadActual() contexto: ContextoUniversidad,
    @Req() req: RequestConUsuario,
    @Body() dto: NombreCarreraDto,
  ) {
    return this.carreras.guardar(contexto, this.usuario(req), dto.nombre)
  }

  @Puede('update', 'Carrera')
  @Patch(':id')
  editar(
    @UniversidadActual() contexto: ContextoUniversidad,
    @Req() req: RequestConUsuario,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: NombreCarreraDto,
  ) {
    return this.carreras.guardar(contexto, this.usuario(req), dto.nombre, id)
  }
}
