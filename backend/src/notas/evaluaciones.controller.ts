import type {
  Evaluacion,
  EvaluacionesSeccion,
  Rol,
  SeccionEspacio,
} from '@cursus/shared'
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
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
import { CrearEvaluacionDto } from './crear-evaluacion.dto.js'
import { EvaluacionesService } from './evaluaciones.service.js'

// Roles en la sección que leen sus evaluaciones. El Administrativo no (aunque
// pase IntegranteSeccionGuard por ser de la facultad del curso).
const LEEN: readonly Rol[] = ['PROFESOR', 'AYUDANTE', 'ALUMNO', 'DIRECTOR']

// NOT-01 (RN-10): evaluaciones del espacio de una sección. Cada ruta exige
// además ser integrante (ESP-06); el rol que se revisa es el de la sección
// (@SeccionActual), no solo el de la cuenta.
@Controller('espacio/secciones/:id/evaluaciones')
export class EvaluacionesController {
  constructor(private readonly evaluaciones: EvaluacionesService) {}

  @Puede('read', 'Evaluacion')
  @IntegranteDeSeccion()
  @Get()
  listar(
    @UniversidadActual() contexto: ContextoUniversidad,
    @SeccionActual() seccion: SeccionEspacio,
  ): Promise<EvaluacionesSeccion> {
    if (!LEEN.includes(seccion.rol)) {
      throw new ForbiddenException()
    }
    return this.evaluaciones.listar(contexto, seccion)
  }

  // Solo el profesor de la sección: el resto de los integrantes, el
  // Administrativo y el Director reciben 403.
  @Puede('create', 'Evaluacion')
  @IntegranteDeSeccion()
  @Post()
  @HttpCode(201)
  crear(
    @UniversidadActual() contexto: ContextoUniversidad,
    @Req() req: RequestConUsuario,
    @SeccionActual() seccion: SeccionEspacio,
    @Body() datos: CrearEvaluacionDto,
  ): Promise<Evaluacion> {
    if (seccion.rol !== 'PROFESOR') {
      throw new ForbiddenException(
        'Solo el profesor de la sección crea evaluaciones',
      )
    }
    return this.evaluaciones.crear(
      contexto,
      req.usuario?.sub as string,
      seccion,
      datos,
    )
  }
}
