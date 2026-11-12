import type { ResumenAsistenciaSeccion, SeccionEspacio } from '@cursus/shared'
import { Controller, Get, Req } from '@nestjs/common'
import type { RequestConUsuario } from '../auth/jwt-auth.guard.js'
import { Puede } from '../auth/permisos.decorator.js'
import { UniversidadActual } from '../auth/universidad-actual.decorator.js'
import type { ContextoUniversidad } from '../database/base-de-datos.service.js'
import {
  IntegranteDeSeccion,
  SeccionActual,
} from '../espacio/integrante-seccion.guard.js'
import { ResumenAsistenciaService } from './resumen-asistencia.service.js'

@Controller('espacio/secciones/:id/asistencia/resumen')
export class ResumenAsistenciaController {
  constructor(private readonly resumen: ResumenAsistenciaService) {}

  @Puede('read', 'Asistencia')
  @IntegranteDeSeccion()
  @Get()
  obtener(
    @UniversidadActual() contexto: ContextoUniversidad,
    @Req() req: RequestConUsuario,
    @SeccionActual() seccion: SeccionEspacio,
  ): Promise<ResumenAsistenciaSeccion> {
    return this.resumen.obtener(contexto, req.usuario?.sub as string, seccion)
  }
}
