import type { SeccionEspacio } from '@cursus/shared'
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Param,
  ParseIntPipe,
  Post,
  Req,
} from '@nestjs/common'
import { IsUUID } from 'class-validator'
import type { RequestConUsuario } from '../auth/jwt-auth.guard.js'
import { Puede } from '../auth/permisos.decorator.js'
import { UniversidadActual } from '../auth/universidad-actual.decorator.js'
import type { ContextoUniversidad } from '../database/base-de-datos.service.js'
import {
  IntegranteDeSeccion,
  SeccionActual,
} from '../espacio/integrante-seccion.guard.js'
import { SilaboService } from './silabo.service.js'

class PublicarSilaboDto {
  @IsUUID()
  archivoId!: string
}

function exigirIntegrante(seccion: SeccionEspacio) {
  if (!['PROFESOR', 'AYUDANTE', 'ALUMNO'].includes(seccion.rol))
    throw new ForbiddenException()
}

@Controller('espacio/secciones/:id/silabo')
export class SilaboController {
  constructor(private readonly silabos: SilaboService) {}

  @Puede('read', 'Archivo')
  @IntegranteDeSeccion()
  @Get()
  listar(
    @UniversidadActual() contexto: ContextoUniversidad,
    @SeccionActual() seccion: SeccionEspacio,
    @Req() req: RequestConUsuario,
  ) {
    exigirIntegrante(seccion)
    return this.silabos.listar(contexto, seccion, req.usuario?.sub as string)
  }

  @Puede('read', 'Archivo')
  @IntegranteDeSeccion()
  @Get(':version')
  @Header('Cache-Control', 'no-store')
  descargar(
    @UniversidadActual() contexto: ContextoUniversidad,
    @SeccionActual() seccion: SeccionEspacio,
    @Req() req: RequestConUsuario,
    @Param('version', ParseIntPipe) version: number,
  ) {
    exigirIntegrante(seccion)
    return this.silabos.descargar(
      contexto,
      seccion,
      req.usuario?.sub as string,
      version,
    )
  }

  @Puede('create', 'Archivo')
  @IntegranteDeSeccion()
  @Post()
  publicar(
    @UniversidadActual() contexto: ContextoUniversidad,
    @SeccionActual() seccion: SeccionEspacio,
    @Req() req: RequestConUsuario,
    @Body() datos: PublicarSilaboDto,
  ) {
    if (seccion.rol !== 'PROFESOR') throw new ForbiddenException()
    return this.silabos.publicar(
      contexto,
      seccion,
      req.usuario?.sub as string,
      datos.archivoId,
    )
  }
}
