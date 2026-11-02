import type {
  AsistenciaClase,
  AsistenciaPropia,
  CambioAsistencia,
  Rol,
  SeccionEspacio,
} from '@cursus/shared'
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { AsistenciaService } from './asistencia.service.js'
import { GuardarAsistenciaDto } from './guardar-asistencia.dto.js'
import { CorregirAsistenciaDto } from './corregir-asistencia.dto.js'

// Roles en la sección que leen la asistencia de una clase: los mismos que
// leen las clases (ASI-01). El alumno usa mi-asistencia (ASI-04).
const LEEN: readonly Rol[] = ['PROFESOR', 'AYUDANTE', 'DIRECTOR']

// ASI-02 (RN-13): asistencia de una clase en el espacio de una sección. Cada
// ruta exige además ser integrante (ESP-06); el rol que se revisa es el de la
// sección (@SeccionActual).
@Controller('espacio/secciones/:id/clases/:claseId/asistencia')
export class AsistenciaController {
  constructor(private readonly asistencia: AsistenciaService) {}

  @Puede('update', 'Asistencia')
  @IntegranteDeSeccion()
  @Patch('alumnos/:alumnoId')
  corregir(
    @UniversidadActual() contexto: ContextoUniversidad,
    @Req() req: RequestConUsuario,
    @SeccionActual() seccion: SeccionEspacio,
    @Param('claseId', ParseUUIDPipe) claseId: string,
    @Param('alumnoId', ParseUUIDPipe) alumnoId: string,
    @Body() datos: CorregirAsistenciaDto,
  ): Promise<AsistenciaClase> {
    return this.asistencia.corregir(
      contexto,
      req.usuario?.sub as string,
      seccion,
      claseId,
      alumnoId,
      datos,
    )
  }

  @Puede('update', 'Asistencia')
  @IntegranteDeSeccion()
  @Get('alumnos/:alumnoId/historial')
  historial(
    @UniversidadActual() contexto: ContextoUniversidad,
    @Req() req: RequestConUsuario,
    @SeccionActual() seccion: SeccionEspacio,
    @Param('claseId', ParseUUIDPipe) claseId: string,
    @Param('alumnoId', ParseUUIDPipe) alumnoId: string,
  ): Promise<CambioAsistencia[]> {
    return this.asistencia.historial(
      contexto,
      req.usuario?.sub as string,
      seccion,
      claseId,
      alumnoId,
    )
  }

  @Puede('read', 'Asistencia')
  @IntegranteDeSeccion()
  @Get()
  obtener(
    @UniversidadActual() contexto: ContextoUniversidad,
    @SeccionActual() seccion: SeccionEspacio,
    @Param('claseId', ParseUUIDPipe) claseId: string,
  ): Promise<AsistenciaClase> {
    if (!LEEN.includes(seccion.rol)) {
      throw new ForbiddenException()
    }
    return this.asistencia.obtener(contexto, seccion, claseId)
  }

  // Solo el profesor de la sección: el resto de los integrantes, el
  // Administrativo y el Director reciben 403.
  @Puede('create', 'Asistencia')
  @IntegranteDeSeccion()
  // POST y no PUT: crea la asistencia una sola vez (409 si se repite). PUT o
  // PATCH sobre la colección no existen: ASI-04 corrige por alumno.
  @Post()
  guardar(
    @UniversidadActual() contexto: ContextoUniversidad,
    @Req() req: RequestConUsuario,
    @SeccionActual() seccion: SeccionEspacio,
    @Param('claseId', ParseUUIDPipe) claseId: string,
    @Body() datos: GuardarAsistenciaDto,
  ): Promise<AsistenciaClase> {
    if (seccion.rol !== 'PROFESOR') {
      throw new ForbiddenException(
        'Solo el profesor de la sección registra la asistencia',
      )
    }
    return this.asistencia.guardar(
      contexto,
      req.usuario?.sub as string,
      seccion,
      claseId,
      datos,
    )
  }
}

// Lectura mínima de ASI-04: ALUMNO ve solo sus marcas vigentes. No habilita
// el GET de la lista completa ni la lectura del historial de correcciones.
@Controller('espacio/secciones/:id/mi-asistencia')
export class AsistenciaPropiaController {
  constructor(private readonly asistencia: AsistenciaService) {}

  @Puede('read', 'Seccion')
  @IntegranteDeSeccion()
  @Get()
  obtener(
    @UniversidadActual() contexto: ContextoUniversidad,
    @Req() req: RequestConUsuario,
    @SeccionActual() seccion: SeccionEspacio,
  ): Promise<AsistenciaPropia[]> {
    return this.asistencia.propia(contexto, req.usuario?.sub as string, seccion)
  }
}
