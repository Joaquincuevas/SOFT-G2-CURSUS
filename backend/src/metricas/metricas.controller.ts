import type { MetricasConsolidadas } from '@cursus/shared'
import { Controller, Get } from '@nestjs/common'
import { Puede } from '../auth/permisos.decorator.js'
import { UniversidadActual } from '../auth/universidad-actual.decorator.js'
import type { ContextoUniversidad } from '../database/base-de-datos.service.js'
import { MetricasService } from './metricas.service.js'

// MET-01: indicadores consolidados del Directorio. Solo el Director tiene
// read de Metricas (CASL); consultarEnTodasLasUniversidades lo vuelve a
// exigir.
@Controller('metricas')
export class MetricasController {
  constructor(private readonly metricas: MetricasService) {}

  @Puede('read', 'Metricas')
  @Get('consolidado')
  consolidado(
    @UniversidadActual() contexto: ContextoUniversidad,
  ): Promise<MetricasConsolidadas> {
    return this.metricas.consolidado(contexto)
  }
}
