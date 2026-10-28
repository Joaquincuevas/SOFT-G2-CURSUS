import type { Actividad, Rol, SeccionEspacio } from '@cursus/shared'
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
import { ActividadesService } from './actividades.service.js'
import { CrearActividadDto } from './crear-actividad.dto.js'

// Roles en la sección que leen sus actividades. El Administrativo no (aunque
// pase IntegranteSeccionGuard por ser de la facultad del curso).
const LEEN: readonly Rol[] = ['PROFESOR', 'AYUDANTE', 'ALUMNO', 'DIRECTOR']

// MAT-08 (RN-08): actividades de entrega del espacio de una sección. Cada
// ruta exige además ser integrante (ESP-06); el rol que se revisa es el de la
// sección (@SeccionActual), no solo el de la cuenta.
@Controller('espacio/secciones/:id/actividades')
export class ActividadesController {
  constructor(private readonly actividades: ActividadesService) {}

  @Puede('read', 'Actividad')
  @IntegranteDeSeccion()
  @Get()
  listar(
    @UniversidadActual() contexto: ContextoUniversidad,
    @SeccionActual() seccion: SeccionEspacio,
  ): Promise<Actividad[]> {
    if (!LEEN.includes(seccion.rol)) {
      throw new ForbiddenException()
    }
    return this.actividades.listar(contexto, seccion)
  }

  // Solo el profesor de la sección: el resto de los integrantes, el
  // Administrativo y el Director reciben 403.
  @Puede('create', 'Actividad')
  @IntegranteDeSeccion()
  @Post()
  @HttpCode(201)
  crear(
    @UniversidadActual() contexto: ContextoUniversidad,
    @Req() req: RequestConUsuario,
    @SeccionActual() seccion: SeccionEspacio,
    @Body() datos: CrearActividadDto,
  ): Promise<Actividad> {
    if (seccion.rol !== 'PROFESOR') {
      throw new ForbiddenException(
        'Solo el profesor de la sección crea actividades',
      )
    }
    return this.actividades.crear(
      contexto,
      req.usuario?.sub as string,
      seccion,
      datos,
    )
  }
}
