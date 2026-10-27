import type { AsistenciaClase, Rol, SeccionEspacio } from '@cursus/shared'
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
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
import { AsistenciaService } from './asistencia.service.js'
import { GuardarAsistenciaDto } from './guardar-asistencia.dto.js'

// Roles en la sección que leen la asistencia de una clase: los mismos que
// leen las clases (ASI-01). El alumno ve la suya en ASI-06.
const LEEN: readonly Rol[] = ['PROFESOR', 'AYUDANTE', 'DIRECTOR']

// ASI-02 (RN-13): asistencia de una clase en el espacio de una sección. Cada
// ruta exige además ser integrante (ESP-06); el rol que se revisa es el de la
// sección (@SeccionActual).
@Controller('espacio/secciones/:id/clases/:claseId/asistencia')
export class AsistenciaController {
  constructor(private readonly asistencia: AsistenciaService) {}

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
  // PATCH quedan para corregir marcas (ASI-04).
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
