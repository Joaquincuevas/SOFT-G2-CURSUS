import type {
  AlumnoAgregado,
  AlumnoQuitado,
  ResultadoCargaAlumnos,
  AlumnosSeccion,
  CursoCreado,
  CursoDetalle,
  CursoEditable,
  CambioCurso,
  CursoListado,
  ProfesorOpcion,
  SeccionDetalle,
} from '@cursus/shared'
import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Patch,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common'
import type { RequestConUsuario } from '../auth/jwt-auth.guard.js'
import { Puede } from '../auth/permisos.decorator.js'
import { UniversidadActual } from '../auth/universidad-actual.decorator.js'
import type { ContextoUniversidad } from '../database/base-de-datos.service.js'
import { AgregarAlumnoDto } from './agregar-alumno.dto.js'
import { AsignarProfesorDto } from './asignar-profesor.dto.js'
import { CrearCursoDto } from './crear-curso.dto.js'
import { FiltroCursosDto } from './filtro-cursos.dto.js'
import { GestionService } from './gestion.service.js'
import { EdicionCursoService } from './edicion-curso.service.js'
import { CargaAlumnosService } from './carga-alumnos.service.js'
import { CargarAlumnosDto } from './cargar-alumnos.dto.js'

// Usuario de la sesión: el JwtAuthGuard global ya lo validó.
const usuarioDe = (req: RequestConUsuario) => req.usuario?.sub as string

@Controller()
export class GestionController {
  constructor(
    private readonly gestion: GestionService,
    private readonly edicion: EdicionCursoService,
    private readonly carga: CargaAlumnosService,
  ) {}

  @Puede('create', 'Inscripcion')
  @Post('secciones/:id/alumnos/csv')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  cargarAlumnosCsv(
    @UniversidadActual() contexto: ContextoUniversidad,
    @Req() req: RequestConUsuario,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() datos: CargarAlumnosDto,
  ): Promise<ResultadoCargaAlumnos> {
    return this.carga.cargar(contexto, usuarioDe(req), id, datos.csv)
  }

  @Puede('update', 'Curso')
  @Get('cursos/:id/edicion')
  obtenerEdicion(
    @UniversidadActual() contexto: ContextoUniversidad,
    @Req() req: RequestConUsuario,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CursoEditable> {
    return this.edicion.obtener(contexto, usuarioDe(req), id)
  }

  @Puede('update', 'Curso')
  @Get('cursos/:id/historial')
  historialCurso(
    @UniversidadActual() contexto: ContextoUniversidad,
    @Req() req: RequestConUsuario,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CambioCurso[]> {
    return this.edicion.historial(contexto, usuarioDe(req), id)
  }

  @Puede('update', 'Curso')
  @Patch('cursos/:id')
  editarCurso(
    @UniversidadActual() contexto: ContextoUniversidad,
    @Req() req: RequestConUsuario,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() datos: CrearCursoDto,
  ): Promise<CursoEditable> {
    return this.edicion.editar(contexto, usuarioDe(req), id, datos)
  }

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

  // Quitar archiva la inscripción (nada se elimina): por eso PATCH y no DELETE.
  @Puede('update', 'Inscripcion')
  @Patch('secciones/:seccionId/alumnos/:usuarioId/quitar')
  quitarAlumno(
    @UniversidadActual() contexto: ContextoUniversidad,
    @Req() req: RequestConUsuario,
    @Param('seccionId', ParseUUIDPipe) seccionId: string,
    @Param('usuarioId', ParseUUIDPipe) usuarioId: string,
  ): Promise<AlumnoQuitado> {
    return this.gestion.quitarAlumno(
      contexto,
      usuarioDe(req),
      seccionId,
      usuarioId,
    )
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

  // GES-12. Las dos rutas piden el mismo permiso: la lista existe para
  // asignar, así que solo la ve quien puede hacerlo.
  @Puede('update', 'Seccion')
  @Get('profesores')
  listarProfesores(
    @UniversidadActual() contexto: ContextoUniversidad,
  ): Promise<ProfesorOpcion[]> {
    return this.gestion.listarProfesores(contexto)
  }

  // Asigna o reemplaza al profesor a cargo de la sección.
  @Puede('update', 'Seccion')
  @Put('secciones/:id/profesor')
  asignarProfesor(
    @UniversidadActual() contexto: ContextoUniversidad,
    @Req() req: RequestConUsuario,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() datos: AsignarProfesorDto,
  ): Promise<SeccionDetalle> {
    return this.gestion.asignarProfesor(
      contexto,
      usuarioDe(req),
      id,
      datos.profesorId,
    )
  }
}
