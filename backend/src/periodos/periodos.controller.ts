import type { Periodo } from '@cursus/shared'
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common'
import { Puede } from '../auth/permisos.decorator.js'
import { UniversidadActual } from '../auth/universidad-actual.decorator.js'
import type { ContextoUniversidad } from '../database/base-de-datos.service.js'
import { CrearPeriodoDto } from './crear-periodo.dto.js'
import { PeriodosService } from './periodos.service.js'

@Controller('periodos')
export class PeriodosController {
  constructor(private readonly periodos: PeriodosService) {}

  @Get()
  @Puede('read', 'Periodo')
  listar(
    @UniversidadActual() contexto: ContextoUniversidad,
  ): Promise<Periodo[]> {
    return this.periodos.listar(contexto)
  }

  @Post()
  @Puede('create', 'Periodo')
  crear(
    @UniversidadActual() contexto: ContextoUniversidad,
    @Body() datos: CrearPeriodoDto,
  ): Promise<Periodo> {
    return this.periodos.crear(contexto, datos)
  }

  @Patch(':id/activar')
  @Puede('update', 'Periodo')
  activar(
    @UniversidadActual() contexto: ContextoUniversidad,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Periodo> {
    return this.periodos.activar(contexto, id)
  }
}
