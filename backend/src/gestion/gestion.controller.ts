import type { CursoCreado } from '@cursus/shared'
import { Body, Controller, Post, Req } from '@nestjs/common'
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
