import type { NotasFinalesSeccion, SeccionEspacio } from '@cursus/shared'
import { Controller, Get } from '@nestjs/common'
import { Puede } from '../auth/permisos.decorator.js'
import { UniversidadActual } from '../auth/universidad-actual.decorator.js'
import type { ContextoUniversidad } from '../database/base-de-datos.service.js'
import {
  IntegranteDeSeccion,
  SeccionActual,
} from '../espacio/integrante-seccion.guard.js'
import { NotasFinalesService } from './notas-finales.service.js'

// NOT-14 (RE-02): el profesor ve la nota final (o parcial) de cada alumno de
// la sección, con el mismo cálculo que el alumno ve en mis-notas. Es de solo
// lectura: no publica ni guarda la nota final.
@Controller('espacio/secciones/:id/notas-finales')
export class NotasFinalesController {
  constructor(private readonly notasFinales: NotasFinalesService) {}

  @Puede('read', 'Nota')
  @IntegranteDeSeccion()
  @Get()
  obtener(
    @UniversidadActual() contexto: ContextoUniversidad,
    @SeccionActual() seccion: SeccionEspacio,
  ): Promise<NotasFinalesSeccion> {
    return this.notasFinales.obtener(contexto, seccion)
  }
}
