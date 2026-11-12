import type {
  DescargaArchivo,
  Material,
  Rol,
  SeccionEspacio,
  VersionMaterial,
} from '@cursus/shared'
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
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
import {
  CrearMaterialDto,
  SubirVersionMaterialDto,
} from './crear-material.dto.js'
import { MaterialesService } from './materiales.service.js'

function exigirProfesor(
  seccion: SeccionEspacio,
  mensaje = 'Solo el profesor de la sección registra materiales',
) {
  if (seccion.rol !== 'PROFESOR') throw new ForbiddenException(mensaje)
}

const SOLO_PROFESOR_VERSIONES =
  'Solo un profesor del curso gestiona las versiones del material'

// MAT-06: listan y descargan los integrantes de la sección y el Director, este
// en solo lectura (como los archivos de MAT-01). El Administrativo de la
// facultad entra a la sección, pero no recibe los materiales.
const LEEN: readonly Rol[] = ['PROFESOR', 'AYUDANTE', 'ALUMNO', 'DIRECTOR']

function exigirLector(seccion: SeccionEspacio) {
  if (!LEEN.includes(seccion.rol)) {
    throw new ForbiddenException()
  }
}

// MAT-04 y MAT-06: materiales del curso de una sección. Cada ruta exige además
// ser integrante (ESP-06); el rol que se revisa es el de la sección
// (@SeccionActual), no solo el de la cuenta. Solo el profesor de la sección
// registra.
@Controller('espacio/secciones/:id/materiales')
export class MaterialesController {
  constructor(private readonly materiales: MaterialesService) {}

  // Los materiales activos del curso, no solo los de su sección.
  @Puede('read', 'Material')
  @IntegranteDeSeccion()
  @Get()
  listar(
    @UniversidadActual() contexto: ContextoUniversidad,
    @Req() req: RequestConUsuario,
    @SeccionActual() seccion: SeccionEspacio,
  ): Promise<Material[]> {
    exigirLector(seccion)
    return this.materiales.listar(contexto, req.usuario?.sub as string, seccion)
  }

  // URL firmada de 5 minutos con el archivo original. El permiso se revisa en
  // cada pedido: quien no es integrante recibe 403 aunque tenga el id.
  @Puede('read', 'Material')
  @IntegranteDeSeccion()
  @Get(':materialId/descarga')
  descarga(
    @UniversidadActual() contexto: ContextoUniversidad,
    @Req() req: RequestConUsuario,
    @SeccionActual() seccion: SeccionEspacio,
    @Param('materialId', ParseUUIDPipe) materialId: string,
  ): Promise<DescargaArchivo> {
    exigirLector(seccion)
    return this.materiales.descarga(
      contexto,
      req.usuario?.sub as string,
      seccion,
      materialId,
    )
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

  // MAT-07: cualquier profesor vigente del curso (lo exige la RLS) sube una
  // versión nueva. Reintentar con el mismo archivo devuelve la misma versión.
  @Puede('create', 'MaterialVersion')
  @IntegranteDeSeccion()
  @Post(':materialId/versiones')
  @HttpCode(201)
  subirVersion(
    @UniversidadActual() contexto: ContextoUniversidad,
    @Req() req: RequestConUsuario,
    @SeccionActual() seccion: SeccionEspacio,
    @Param('materialId', ParseUUIDPipe) materialId: string,
    @Body() datos: SubirVersionMaterialDto,
  ): Promise<VersionMaterial> {
    exigirProfesor(seccion, SOLO_PROFESOR_VERSIONES)
    return this.materiales.subirVersion(
      contexto,
      req.usuario?.sub as string,
      seccion,
      materialId,
      datos.archivoId,
    )
  }

  // MAT-07: historial, solo para el profesor. El resto ve la vigente en el
  // listado.
  @Puede('read', 'MaterialVersion')
  @IntegranteDeSeccion()
  @Get(':materialId/versiones')
  versiones(
    @UniversidadActual() contexto: ContextoUniversidad,
    @Req() req: RequestConUsuario,
    @SeccionActual() seccion: SeccionEspacio,
    @Param('materialId', ParseUUIDPipe) materialId: string,
  ): Promise<VersionMaterial[]> {
    exigirProfesor(seccion, SOLO_PROFESOR_VERSIONES)
    return this.materiales.versiones(
      contexto,
      req.usuario?.sub as string,
      seccion,
      materialId,
    )
  }

  @Puede('read', 'MaterialVersion')
  @IntegranteDeSeccion()
  @Get(':materialId/versiones/:version/descarga')
  descargaVersion(
    @UniversidadActual() contexto: ContextoUniversidad,
    @Req() req: RequestConUsuario,
    @SeccionActual() seccion: SeccionEspacio,
    @Param('materialId', ParseUUIDPipe) materialId: string,
    @Param('version', ParseIntPipe) version: number,
  ): Promise<DescargaArchivo> {
    exigirProfesor(seccion, SOLO_PROFESOR_VERSIONES)
    return this.materiales.descargaVersion(
      contexto,
      req.usuario?.sub as string,
      seccion,
      materialId,
      version,
    )
  }
}
