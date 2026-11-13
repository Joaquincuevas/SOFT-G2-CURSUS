import type {
  DetalleHistorialAlumno,
  PeriodoHistorialAlumno,
} from '@cursus/shared'
import { Controller, Get, Param, ParseUUIDPipe, Req } from '@nestjs/common'
import type { RequestConUsuario } from '../auth/jwt-auth.guard.js'
import { Puede } from '../auth/permisos.decorator.js'
import { PermitidaEgresado } from '../auth/permitida-egresado.decorator.js'
import { UniversidadActual } from '../auth/universidad-actual.decorator.js'
import type { ContextoUniversidad } from '../database/base-de-datos.service.js'
import { HistorialAlumnoService } from './historial-alumno.service.js'

@Controller('mis-cursos/historial')
export class HistorialAlumnoController {
  constructor(private readonly historial: HistorialAlumnoService) {}

  @Puede('read', 'MisCursos')
  @PermitidaEgresado()
  @Get()
  listar(
    @UniversidadActual() contexto: ContextoUniversidad,
    @Req() req: RequestConUsuario,
  ): Promise<PeriodoHistorialAlumno[]> {
    return this.historial.listar(contexto, req.usuario?.sub as string)
  }

  @Puede('read', 'MisCursos')
  @PermitidaEgresado()
  @Get(':seccionId')
  obtener(
    @UniversidadActual() contexto: ContextoUniversidad,
    @Req() req: RequestConUsuario,
    @Param('seccionId', ParseUUIDPipe) seccionId: string,
  ): Promise<DetalleHistorialAlumno> {
    return this.historial.obtener(
      contexto,
      req.usuario?.sub as string,
      seccionId,
    )
  }
}
