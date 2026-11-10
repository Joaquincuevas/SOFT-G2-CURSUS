import type {
  ArchivoResumen,
  DescargaArchivo,
  Rol,
  SeccionEspacio,
  SubidaArchivo,
} from '@cursus/shared'
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
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
import { ArchivosService } from './archivos.service.js'
import { PedirSubidaDto } from './pedir-subida.dto.js'

// Roles en la sección. El Administrativo pasa IntegranteSeccionGuard por ser
// de la facultad del curso, pero no sube ni descarga; el Director solo
// descarga (ADR 0001).
const SUBEN: readonly Rol[] = ['PROFESOR', 'AYUDANTE', 'ALUMNO']
const DESCARGAN: readonly Rol[] = [...SUBEN, 'DIRECTOR']

function exigirRol(seccion: SeccionEspacio, roles: readonly Rol[]) {
  if (!roles.includes(seccion.rol)) {
    throw new ForbiddenException()
  }
}

// MAT-01: subir y descargar archivos de una sección, solo sus integrantes
// (ESP-06). Subir tiene dos pasos: pedir la subida (registra el archivo y
// firma un POST directo a S3) y confirmarla cuando el navegador terminó.
@Controller('espacio/secciones/:id/archivos')
export class ArchivosController {
  constructor(private readonly archivos: ArchivosService) {}

  @Puede('create', 'Archivo')
  @IntegranteDeSeccion()
  @Post()
  @HttpCode(201)
  pedirSubida(
    @UniversidadActual() contexto: ContextoUniversidad,
    @Req() req: RequestConUsuario,
    @SeccionActual() seccion: SeccionEspacio,
    @Body() datos: PedirSubidaDto,
  ): Promise<SubidaArchivo> {
    exigirRol(seccion, SUBEN)
    return this.archivos.pedirSubida(
      contexto,
      req.usuario?.sub as string,
      seccion,
      datos,
    )
  }

  @Puede('create', 'Archivo')
  @IntegranteDeSeccion()
  @Post(':archivoId/confirmar')
  @HttpCode(200)
  confirmar(
    @UniversidadActual() contexto: ContextoUniversidad,
    @Req() req: RequestConUsuario,
    @SeccionActual() seccion: SeccionEspacio,
    @Param('archivoId', ParseUUIDPipe) archivoId: string,
  ): Promise<ArchivoResumen> {
    exigirRol(seccion, SUBEN)
    return this.archivos.confirmar(
      contexto,
      req.usuario?.sub as string,
      seccion,
      archivoId,
    )
  }

  @Puede('read', 'Archivo')
  @IntegranteDeSeccion()
  @Get(':archivoId/descarga')
  descarga(
    @UniversidadActual() contexto: ContextoUniversidad,
    @Req() req: RequestConUsuario,
    @SeccionActual() seccion: SeccionEspacio,
    @Param('archivoId', ParseUUIDPipe) archivoId: string,
  ): Promise<DescargaArchivo> {
    exigirRol(seccion, DESCARGAN)
    return this.archivos.descarga(
      contexto,
      req.usuario?.sub as string,
      seccion,
      archivoId,
    )
  }
}
