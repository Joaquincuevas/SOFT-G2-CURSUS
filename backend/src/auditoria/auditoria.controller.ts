import type { PaginaEventos, UniversidadDelFiltro } from '@cursus/shared'
import { BadRequestException, Controller, Get, Query } from '@nestjs/common'
import { Puede } from '../auth/permisos.decorator.js'
import { UniversidadActual } from '../auth/universidad-actual.decorator.js'
import type { ContextoUniversidad } from '../database/base-de-datos.service.js'
import { AuditoriaService } from './auditoria.service.js'
import { FiltroEventosDto } from './filtro-eventos.dto.js'

// SEG-05: el Director consulta el log de accesos y acciones (SEG-04). Solo él
// tiene read RegistroAccesos (CASL); consultarEnTodasLasUniversidades lo vuelve
// a exigir y la lectura corre READ ONLY.
@Controller('auditoria')
export class AuditoriaController {
  constructor(private readonly auditoria: AuditoriaService) {}

  @Puede('read', 'RegistroAccesos')
  @Get('universidades')
  universidades(
    @UniversidadActual() contexto: ContextoUniversidad,
  ): Promise<UniversidadDelFiltro[]> {
    return this.auditoria.universidades(contexto)
  }

  @Puede('read', 'RegistroAccesos')
  @Get('eventos')
  eventos(
    @UniversidadActual() contexto: ContextoUniversidad,
    @Query() filtro: FiltroEventosDto,
  ): Promise<PaginaEventos> {
    if (
      filtro.desde &&
      filtro.hasta &&
      new Date(filtro.desde) > new Date(filtro.hasta)
    ) {
      throw new BadRequestException('desde no puede ser posterior a hasta')
    }
    return this.auditoria.eventos(contexto, filtro)
  }
}
