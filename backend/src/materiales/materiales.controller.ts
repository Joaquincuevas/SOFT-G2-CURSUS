import type { Material, SeccionEspacio } from '@cursus/shared'
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
import { CrearMaterialDto } from './crear-material.dto.js'
import { MaterialesService } from './materiales.service.js'

function exigirProfesor(seccion: SeccionEspacio) {
  if (seccion.rol !== 'PROFESOR') {
    throw new ForbiddenException(
      'Solo el profesor de la sección registra materiales',
    )
  }
}

// MAT-04: materiales del curso de una sección. Cada ruta exige además ser
// integrante (ESP-06); el rol que se revisa es el de la sección
// (@SeccionActual), no solo el de la cuenta. Por ahora solo el profesor de la
// sección registra y lista: el listado y la descarga para el resto de los
// integrantes son de MAT-05 y MAT-06.
@Controller('espacio/secciones/:id/materiales')
export class MaterialesController {
  constructor(private readonly materiales: MaterialesService) {}

  // Lo justo para que el profesor vea lo que subió: los materiales activos
  // del curso, no solo los de su sección.
  @Puede('read', 'Material')
  @IntegranteDeSeccion()
  @Get()
  listar(
    @UniversidadActual() contexto: ContextoUniversidad,
    @Req() req: RequestConUsuario,
    @SeccionActual() seccion: SeccionEspacio,
  ): Promise<Material[]> {
    exigirProfesor(seccion)
    return this.materiales.listar(contexto, req.usuario?.sub as string, seccion)
  }

  // Solo el profesor de la sección: el ayudante, el alumno, el Administrativo
  // y el Director reciben 403.
  @Puede('create', 'Material')
  @IntegranteDeSeccion()
  @Post()
  @HttpCode(201)
  crear(
    @UniversidadActual() contexto: ContextoUniversidad,
    @Req() req: RequestConUsuario,
    @SeccionActual() seccion: SeccionEspacio,
    @Body() datos: CrearMaterialDto,
  ): Promise<Material> {
    exigirProfesor(seccion)
    return this.materiales.crear(
      contexto,
      req.usuario?.sub as string,
      seccion,
      datos,
    )
  }
}
