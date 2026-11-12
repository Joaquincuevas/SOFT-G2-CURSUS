import type {
  MetricasConsolidadas,
  MetricasFacultad,
  MetricasCarrera,
  MetricasUniversidad,
  PeriodoDisponible,
  ReporteFacultad,
  ResumenUniversidad,
} from '@cursus/shared'
import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
} from '@nestjs/common'
import type { RequestConUsuario } from '../auth/jwt-auth.guard.js'
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
  const semestre = Number(partes[2])
  if (semestre !== 1 && semestre !== 2) {
    throw new BadRequestException('semestre debe ser 1 o 2')
  }
  return { anio: Number(partes[1]), semestre }
}

// MET-01 y MET-04: indicadores del Directorio. Solo el Director tiene read de
// Metricas (CASL); consultarEnTodasLasUniversidades lo vuelve a exigir.
@Controller('metricas')
export class MetricasController {
  constructor(private readonly metricas: MetricasService) {}

  @Puede('read', 'ReporteMetricasFacultad')
  @Get('facultad')
  reporteFacultad(
    @UniversidadActual() contexto: ContextoUniversidad,
    @Req() req: RequestConUsuario,
    @Query('periodo') periodo?: string,
  ): Promise<ReporteFacultad> {
    if (contexto.rol !== 'ADMINISTRATIVO') throw new ForbiddenException()
    return this.metricas.reporteFacultad(
      contexto,
      req.usuario?.sub as string,
      periodoDe(periodo),
    )
  }

  @Puede('read', 'Metricas')
  @Get('periodos')
  periodos(
    @UniversidadActual() contexto: ContextoUniversidad,
  ): Promise<PeriodoDisponible[]> {
    return this.metricas.periodos(contexto)
  }

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

  // MET-05: carreras vigentes de una facultad. 404 si no existe o está archivada.
  @Puede('read', 'Metricas')
  @Get('facultades/:id/carreras')
  carreras(
    @UniversidadActual() contexto: ContextoUniversidad,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('periodo') periodo?: string,
  ): Promise<MetricasFacultad> {
    return this.metricas.carreras(contexto, id, periodoDe(periodo))
  }

  // MET-06: cursos vigentes de una carrera. 404 si no existe o está archivada.
  @Puede('read', 'Metricas')
  @Get('carreras/:id/cursos')
  cursos(
    @UniversidadActual() contexto: ContextoUniversidad,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('periodo') periodo?: string,
  ): Promise<MetricasCarrera> {
    return this.metricas.cursos(contexto, id, periodoDe(periodo))
  }
}
