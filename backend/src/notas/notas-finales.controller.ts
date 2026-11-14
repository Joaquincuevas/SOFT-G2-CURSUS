import type { NotasFinalesSeccion, SeccionEspacio } from '@cursus/shared'
import { Controller, Get, Header, Req } from '@nestjs/common'
import type { RequestConUsuario } from '../auth/jwt-auth.guard.js'
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

  @Puede('read', 'Nota')
  @IntegranteDeSeccion()
  @Get('csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="notas.csv"')
  @Header('Cache-Control', 'no-store')
  exportarCsv(
    @UniversidadActual() contexto: ContextoUniversidad,
    @SeccionActual() seccion: SeccionEspacio,
    @Req() req: RequestConUsuario,
  ): Promise<string> {
    return this.notasFinales.exportarCsv(
      contexto,
      seccion,
      req.usuario?.sub as string,
    )
  }
}
