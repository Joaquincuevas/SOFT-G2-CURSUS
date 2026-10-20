import type { SeccionDashboard } from '@cursus/shared'
import { Controller, Get, Req } from '@nestjs/common'
import type { RequestConUsuario } from '../auth/jwt-auth.guard.js'
import { SoloSesion } from '../auth/permisos.decorator.js'
import { UniversidadActual } from '../auth/universidad-actual.decorator.js'
import type { ContextoUniversidad } from '../database/base-de-datos.service.js'
import { DashboardService } from './dashboard.service.js'

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  // Solo sesión: la consulta filtra siempre por el usuario de la sesión, así
  // que cada uno recibe solo sus secciones.
  @SoloSesion()
  @Get('mis-secciones')
  misSecciones(
    @UniversidadActual() contexto: ContextoUniversidad,
    @Req() req: RequestConUsuario,
  ): Promise<SeccionDashboard[]> {
    return this.dashboard.misSecciones(contexto, req.usuario?.sub as string)
  }
}
