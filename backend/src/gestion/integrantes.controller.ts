import type { BusquedaIntegrantes, IntegrantesSeccion } from '@cursus/shared'
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common'
import type { RequestConUsuario } from '../auth/jwt-auth.guard.js'
import { Puede } from '../auth/permisos.decorator.js'
import { UniversidadActual } from '../auth/universidad-actual.decorator.js'
import type { ContextoUniversidad } from '../database/base-de-datos.service.js'
import {
  AgregarIntegranteDto,
  BuscarIntegrantesDto,
  QuitarIntegranteDto,
} from './integrantes.dto.js'
import { IntegrantesService } from './integrantes.service.js'

@Controller('secciones/:id/integrantes')
export class IntegrantesController {
  constructor(private readonly integrantes: IntegrantesService) {}
  @Puede('update', 'Seccion')
  @Get()
  listar(
    @UniversidadActual() contexto: ContextoUniversidad,
    @Req() req: RequestConUsuario,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<IntegrantesSeccion> {
    return this.integrantes.listar(contexto, req.usuario!.sub, id)
  }
  @Puede('update', 'Seccion')
  @Get('buscar')
  buscar(
    @UniversidadActual() contexto: ContextoUniversidad,
    @Req() req: RequestConUsuario,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() filtro: BuscarIntegrantesDto,
  ): Promise<BusquedaIntegrantes> {
    return this.integrantes.buscar(contexto, req.usuario!.sub, id, filtro)
  }
  @Puede('update', 'Seccion')
  @Post()
  @HttpCode(204)
  agregar(
    @UniversidadActual() contexto: ContextoUniversidad,
    @Req() req: RequestConUsuario,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() datos: AgregarIntegranteDto,
  ): Promise<void> {
    return this.integrantes.agregar(contexto, req.usuario!.sub, id, datos)
  }
  @Puede('update', 'Seccion')
  @Patch(':usuarioId/quitar')
  @HttpCode(204)
  quitar(
    @UniversidadActual() contexto: ContextoUniversidad,
    @Req() req: RequestConUsuario,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('usuarioId', ParseUUIDPipe) usuario: string,
    @Body() datos: QuitarIntegranteDto,
  ): Promise<void> {
    return this.integrantes.quitar(
      contexto,
      req.usuario!.sub,
      id,
      usuario,
      datos,
    )
  }
}
