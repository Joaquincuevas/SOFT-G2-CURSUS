import type { MiEntregaActividad, SeccionEspacio } from '@cursus/shared'
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
import {
  IntegranteDeSeccion,
  SeccionActual,
} from '../espacio/integrante-seccion.guard.js'
import { EntregarInformeDto } from './entregar-informe.dto.js'
import { EntregasService } from './entregas.service.js'

@Controller('espacio/secciones/:id/actividades/:actividadId/mi-entrega')
export class EntregasController {
  constructor(private readonly entregas: EntregasService) {}

  @Puede('read', 'Entrega')
  @IntegranteDeSeccion()
  @Get()
  obtener(
    @UniversidadActual() contexto: ContextoUniversidad,
    @Req() req: RequestConUsuario,
    @SeccionActual() seccion: SeccionEspacio,
    @Param('actividadId', ParseUUIDPipe) actividadId: string,
  ): Promise<MiEntregaActividad> {
    return this.entregas.obtener(
      contexto,
      req.usuario!.sub,
      seccion,
      actividadId,
    )
  }

  @Puede('create', 'Entrega')
  @IntegranteDeSeccion()
  @Put()
  entregar(
    @UniversidadActual() contexto: ContextoUniversidad,
    @Req() req: RequestConUsuario,
    @SeccionActual() seccion: SeccionEspacio,
    @Param('actividadId', ParseUUIDPipe) actividadId: string,
    @Body() datos: EntregarInformeDto,
  ): Promise<MiEntregaActividad> {
    return this.entregas.entregar(
      contexto,
      req.usuario!.sub,
      seccion,
      actividadId,
      datos,
    )
  }
}
