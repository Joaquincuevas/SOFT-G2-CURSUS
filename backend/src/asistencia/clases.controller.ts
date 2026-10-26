import type { Clase, Rol, SeccionEspacio } from '@cursus/shared'
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
import { ClasesService } from './clases.service.js'
import { CrearClaseDto } from './crear-clase.dto.js'

// Roles en la sección que leen sus clases. El alumno no (ve su asistencia en
// ASI-06) y el Administrativo tampoco, aunque pase IntegranteSeccionGuard
// por ser de la facultad del curso.
const LEEN: readonly Rol[] = ['PROFESOR', 'AYUDANTE', 'DIRECTOR']

// ASI-01 (RN-13): clases del espacio de una sección. Cada ruta exige además
// ser integrante (ESP-06); el rol que se revisa es el de la sección
// (@SeccionActual), no solo el de la cuenta.
@Controller('espacio/secciones/:id/clases')
export class ClasesController {
  constructor(private readonly clases: ClasesService) {}

  @Puede('read', 'Clase')
  @IntegranteDeSeccion()
  @Get()
  listar(
    @UniversidadActual() contexto: ContextoUniversidad,
    @SeccionActual() seccion: SeccionEspacio,
  ): Promise<Clase[]> {
    if (!LEEN.includes(seccion.rol)) {
      throw new ForbiddenException()
    }
    return this.clases.listar(contexto, seccion)
  }

  // Solo el profesor de la sección: el resto de los integrantes, el
  // Administrativo y el Director reciben 403.
  @Puede('create', 'Clase')
  @IntegranteDeSeccion()
  @Post()
  @HttpCode(201)
  crear(
    @UniversidadActual() contexto: ContextoUniversidad,
    @Req() req: RequestConUsuario,
    @SeccionActual() seccion: SeccionEspacio,
    @Body() datos: CrearClaseDto,
  ): Promise<Clase> {
    if (seccion.rol !== 'PROFESOR') {
      throw new ForbiddenException(
        'Solo el profesor de la sección registra clases',
      )
    }
    return this.clases.crear(
      contexto,
      req.usuario?.sub as string,
      seccion,
      datos,
    )
  }
}
