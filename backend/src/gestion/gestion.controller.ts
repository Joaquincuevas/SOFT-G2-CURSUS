import type { CursoCreado, OpcionCarrera, OpcionPeriodo } from '@cursus/shared'
import { Body, Controller, Get, Post, Req } from '@nestjs/common'
import type { RequestConUsuario } from '../auth/jwt-auth.guard.js'
import { Puede } from '../auth/permisos.decorator.js'
import { UniversidadActual } from '../auth/universidad-actual.decorator.js'
import type { ContextoUniversidad } from '../database/base-de-datos.service.js'
import { CrearCursoDto } from './crear-curso.dto.js'
import { GestionService } from './gestion.service.js'

// Usuario de la sesión: el JwtAuthGuard global ya lo validó.
const usuarioDe = (req: RequestConUsuario) => req.usuario?.sub as string

@Controller()
export class GestionController {
  constructor(private readonly gestion: GestionService) {}

  // Solo lectura, para las listas del formulario. Crear y editar carreras y
  // períodos llegan con GES-01 y GES-02.
  @Puede('read', 'Carrera')
  @Get('carreras')
  listarCarreras(
    @UniversidadActual() contexto: ContextoUniversidad,
    @Req() req: RequestConUsuario,
  ): Promise<OpcionCarrera[]> {
    return this.gestion.listarCarreras(contexto, usuarioDe(req))
  }

  @Puede('read', 'Periodo')
  @Get('periodos')
  listarPeriodos(
    @UniversidadActual() contexto: ContextoUniversidad,
  ): Promise<OpcionPeriodo[]> {
    return this.gestion.listarPeriodos(contexto)
  }

  @Puede('create', 'Curso')
  @Post('cursos')
  crearCurso(
    @UniversidadActual() contexto: ContextoUniversidad,
    @Req() req: RequestConUsuario,
    @Body() datos: CrearCursoDto,
  ): Promise<CursoCreado> {
    return this.gestion.crearCurso(contexto, usuarioDe(req), datos)
  }
}
