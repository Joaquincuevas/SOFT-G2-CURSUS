import type {
  DescargaArchivo,
  SeccionEspacio,
  SilaboVigente,
} from '@cursus/shared'
import { Controller, Get, Header, Req } from '@nestjs/common'
import type { RequestConUsuario } from '../auth/jwt-auth.guard.js'
import { Puede } from '../auth/permisos.decorator.js'
import { UniversidadActual } from '../auth/universidad-actual.decorator.js'
import type { ContextoUniversidad } from '../database/base-de-datos.service.js'
import {
  IntegranteDeSeccion,
  SeccionActual,
} from '../espacio/integrante-seccion.guard.js'
import { SilaboVigenteService } from './silabo-vigente.service.js'

@Controller('espacio/secciones/:id/silabo-vigente')
export class SilaboVigenteController {
  constructor(private readonly silabos: SilaboVigenteService) {}

  @Puede('read', 'Archivo')
  @IntegranteDeSeccion()
  @Get()
  @Header('Cache-Control', 'no-store')
  obtener(
    @UniversidadActual() contexto: ContextoUniversidad,
    @SeccionActual() seccion: SeccionEspacio,
    @Req() req: RequestConUsuario,
  ): Promise<SilaboVigente> {
    return this.silabos.obtener(contexto, seccion, req.usuario?.sub as string)
  }

  @Puede('read', 'Archivo')
  @IntegranteDeSeccion()
  @Get('descarga')
  @Header('Cache-Control', 'no-store')
  descargar(
    @UniversidadActual() contexto: ContextoUniversidad,
    @SeccionActual() seccion: SeccionEspacio,
    @Req() req: RequestConUsuario,
  ): Promise<DescargaArchivo> {
    return this.silabos.descargar(contexto, seccion, req.usuario?.sub as string)
  }
}
