import type { NotasEvaluacion, Rol, SeccionEspacio } from '@cursus/shared'
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
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
import { GuardarNotasDto } from './guardar-notas.dto.js'
import { NotasService } from './notas.service.js'

// Roles en la sección que leen las notas propuestas. El alumno ve las suyas,
// publicadas, en NOT-13.
const LEEN: readonly Rol[] = ['PROFESOR', 'AYUDANTE', 'DIRECTOR']

// NOT-05 (RN-10): notas de una evaluación en el espacio de una sección. Cada
// ruta exige además ser integrante (ESP-06); el rol que se revisa es el de la
// sección (@SeccionActual).
@Controller('espacio/secciones/:id/evaluaciones/:evaluacionId/notas')
export class NotasController {
  constructor(private readonly notas: NotasService) {}

  @Puede('read', 'Nota')
  @IntegranteDeSeccion()
  @Get()
  obtener(
    @UniversidadActual() contexto: ContextoUniversidad,
    @SeccionActual() seccion: SeccionEspacio,
    @Param('evaluacionId', ParseUUIDPipe) evaluacionId: string,
  ): Promise<NotasEvaluacion> {
    if (!LEEN.includes(seccion.rol)) {
      throw new ForbiddenException()
    }
    return this.notas.obtener(contexto, seccion, evaluacionId)
  }

  // PUT: guardar las mismas notas otra vez no cambia nada ni deja eventos.
  // Solo un ayudante de la sección: el profesor, el alumno, el Administrativo
  // y el Director reciben 403.
  @Puede('update', 'Nota')
  @IntegranteDeSeccion()
  @Put()
  guardar(
    @UniversidadActual() contexto: ContextoUniversidad,
    @Req() req: RequestConUsuario,
    @SeccionActual() seccion: SeccionEspacio,
    @Param('evaluacionId', ParseUUIDPipe) evaluacionId: string,
    @Body() datos: GuardarNotasDto,
  ): Promise<NotasEvaluacion> {
    if (seccion.rol !== 'AYUDANTE') {
      throw new ForbiddenException(
        'Solo un ayudante de la sección ingresa notas',
      )
    }
    return this.notas.guardar(
      contexto,
      req.usuario?.sub as string,
      seccion,
      evaluacionId,
      datos,
    )
  }
}
