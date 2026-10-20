import type {
  AlumnoAgregado,
  AlumnosSeccion,
  CursoCreado,
  CursoDetalle,
  CursoListado,
  SeccionDetalle,
} from '@cursus/shared'
import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common'
import type { RequestConUsuario } from '../auth/jwt-auth.guard.js'
import { Puede } from '../auth/permisos.decorator.js'
import { UniversidadActual } from '../auth/universidad-actual.decorator.js'
import type { ContextoUniversidad } from '../database/base-de-datos.service.js'
import { AgregarAlumnoDto } from './agregar-alumno.dto.js'
import { CrearCursoDto } from './crear-curso.dto.js'
import { FiltroCursosDto } from './filtro-cursos.dto.js'
import { GestionService } from './gestion.service.js'

// Usuario de la sesión: el JwtAuthGuard global ya lo validó.
const usuarioDe = (req: RequestConUsuario) => req.usuario?.sub as string

@Controller()
export class GestionController {
  constructor(private readonly gestion: GestionService) {}

  @Puede('read', 'Curso')
  @Get('cursos')
  listarCursos(
    @UniversidadActual() contexto: ContextoUniversidad,
    @Req() req: RequestConUsuario,
    @Query() filtro: FiltroCursosDto,
  ): Promise<CursoListado[]> {
    return this.gestion.listarCursos(contexto, usuarioDe(req), filtro)
  }

  @Puede('read', 'Curso')
  @Get('cursos/:id')
  obtenerCurso(
    @UniversidadActual() contexto: ContextoUniversidad,
    @Req() req: RequestConUsuario,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CursoDetalle> {
    return this.gestion.obtenerCurso(contexto, usuarioDe(req), id)
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

  // Sin body: el número de la sección lo asigna el backend.
  @Puede('create', 'Seccion')
  @Post('cursos/:id/secciones')
  crearSeccion(
    @UniversidadActual() contexto: ContextoUniversidad,
    @Req() req: RequestConUsuario,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SeccionDetalle> {
    return this.gestion.crearSeccion(contexto, usuarioDe(req), id)
  }

  @Puede('read', 'Inscripcion')
  @Get('secciones/:id/alumnos')
  listarAlumnos(
    @UniversidadActual() contexto: ContextoUniversidad,
    @Req() req: RequestConUsuario,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AlumnosSeccion> {
    return this.gestion.listarAlumnos(contexto, usuarioDe(req), id)
  }

  // La respuesta puede traer la contraseña provisoria: no se guarda en caché
  // (también lo fija configurarApp para toda la API).
  @Puede('create', 'Inscripcion')
  @Post('secciones/:id/alumnos')
  @Header('Cache-Control', 'no-store')
  agregarAlumno(
    @UniversidadActual() contexto: ContextoUniversidad,
    @Req() req: RequestConUsuario,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() datos: AgregarAlumnoDto,
  ): Promise<AlumnoAgregado> {
    return this.gestion.agregarAlumno(contexto, usuarioDe(req), id, datos)
  }
}
