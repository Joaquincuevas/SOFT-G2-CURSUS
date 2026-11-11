import type { MisNotasSeccion, SeccionEspacio } from '@cursus/shared'
import { Controller, Get, Req } from '@nestjs/common'
import type { RequestConUsuario } from '../auth/jwt-auth.guard.js'
import { Puede } from '../auth/permisos.decorator.js'
import { UniversidadActual } from '../auth/universidad-actual.decorator.js'
import type { ContextoUniversidad } from '../database/base-de-datos.service.js'
import {
  IntegranteDeSeccion,
  SeccionActual,
} from '../espacio/integrante-seccion.guard.js'
import { MisNotasService } from './mis-notas.service.js'

// NOT-13 (RE-02): el alumno ve sus notas publicadas en la sección, como
// mi-asistencia (ASI-06). No habilita el GET de las notas de una evaluación,
// que sigue siendo del profesor, el ayudante y el Director.
@Controller('espacio/secciones/:id/mis-notas')
export class MisNotasController {
  constructor(private readonly misNotas: MisNotasService) {}

  @Puede('read', 'Seccion')
  @IntegranteDeSeccion()
  @Get()
  obtener(
    @UniversidadActual() contexto: ContextoUniversidad,
    @Req() req: RequestConUsuario,
    @SeccionActual() seccion: SeccionEspacio,
  ): Promise<MisNotasSeccion> {
    return this.misNotas.obtener(contexto, req.usuario?.sub as string, seccion)
  }
}
