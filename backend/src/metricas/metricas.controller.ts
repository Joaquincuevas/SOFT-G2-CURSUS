import type {
  MetricasConsolidadas,
  MetricasUniversidad,
  ResumenUniversidad,
} from '@cursus/shared'
import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common'
import { Puede } from '../auth/permisos.decorator.js'
import { UniversidadActual } from '../auth/universidad-actual.decorator.js'
import type { ContextoUniversidad } from '../database/base-de-datos.service.js'
import { MetricasService, type PeriodoPedido } from './metricas.service.js'

// "2026-2" → { anio: 2026, semestre: 2 }; sin valor, el período activo. Un
// formato distinto es 400, no un período vacío.
function periodoDe(valor: string | undefined): PeriodoPedido | null {
  if (valor === undefined) return null
  const partes = /^(\d{4})-(\d{1,2})$/.exec(valor)
  if (!partes) {
    throw new BadRequestException('periodo debe tener la forma AAAA-S')
  }
  return { anio: Number(partes[1]), semestre: Number(partes[2]) }
}

// MET-01 y MET-04: indicadores del Directorio. Solo el Director tiene read de
// Metricas (CASL); consultarEnTodasLasUniversidades lo vuelve a exigir.
@Controller('metricas')
export class MetricasController {
  constructor(private readonly metricas: MetricasService) {}

  @Puede('read', 'Metricas')
  @Get('consolidado')
  consolidado(
    @UniversidadActual() contexto: ContextoUniversidad,
    @Query('periodo') periodo?: string,
  ): Promise<MetricasConsolidadas> {
    return this.metricas.consolidado(contexto, periodoDe(periodo))
  }

  // MET-04: primer nivel del drill-down.
  @Puede('read', 'Metricas')
  @Get('universidades')
  universidades(
    @UniversidadActual() contexto: ContextoUniversidad,
    @Query('periodo') periodo?: string,
  ): Promise<ResumenUniversidad[]> {
    return this.metricas.universidades(contexto, periodoDe(periodo))
  }

  // MET-04: facultades de una universidad. 404 si no existe.
  @Puede('read', 'Metricas')
  @Get('universidades/:id/facultades')
  facultades(
    @UniversidadActual() contexto: ContextoUniversidad,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('periodo') periodo?: string,
  ): Promise<MetricasUniversidad> {
    return this.metricas.facultades(contexto, id, periodoDe(periodo))
  }
}
