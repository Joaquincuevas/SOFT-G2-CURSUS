import type { FacultadElegible, UniversidadElegible } from '@cursus/shared'
import {
  Body,
  Controller,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common'
import type { RequestConUsuario } from '../auth/jwt-auth.guard.js'
import { Puede } from '../auth/permisos.decorator.js'
import {
  CrearUniversidadDto,
  EditarUniversidadDto,
  GuardarFacultadDto,
} from './universidad.dto.js'
import {
  type Superadmin,
  UniversidadesService,
} from './universidades.service.js'

// GES-23: el superadmin crea, edita y archiva universidades y facultades.
// Funciona sin universidad elegida (vista global). Archivar es un PATCH, como
// quitar en las demás rutas: nada se borra.
@Controller('superadmin')
export class UniversidadesController {
  constructor(private readonly universidades: UniversidadesService) {}

  private superadmin(req: RequestConUsuario): Superadmin {
    if (!req.usuario?.sub) throw new UnauthorizedException()
    return { id: req.usuario.sub, rol: req.usuario.rol }
  }

  @Puede('create', 'Universidad')
  @Post('universidades')
  crearUniversidad(
    @Req() req: RequestConUsuario,
    @Body() datos: CrearUniversidadDto,
  ): Promise<UniversidadElegible> {
    return this.universidades.crearUniversidad(this.superadmin(req), datos)
  }

  @Puede('update', 'Universidad')
  @Patch('universidades/:id')
  editarUniversidad(
    @Req() req: RequestConUsuario,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() datos: EditarUniversidadDto,
  ): Promise<UniversidadElegible> {
    return this.universidades.editarUniversidad(this.superadmin(req), id, datos)
  }

  @Puede('update', 'Universidad')
  @Patch('universidades/:id/archivar')
  @HttpCode(204)
  archivarUniversidad(
    @Req() req: RequestConUsuario,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.universidades.archivarUniversidad(this.superadmin(req), id)
  }

  @Puede('create', 'Facultad')
  @Post('universidades/:id/facultades')
  crearFacultad(
    @Req() req: RequestConUsuario,
    @Param('id', ParseUUIDPipe) universidadId: string,
    @Body() datos: GuardarFacultadDto,
  ): Promise<FacultadElegible> {
    return this.universidades.crearFacultad(
      this.superadmin(req),
      universidadId,
      datos.nombre,
    )
  }

  @Puede('update', 'Facultad')
  @Patch('facultades/:id')
  editarFacultad(
    @Req() req: RequestConUsuario,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() datos: GuardarFacultadDto,
  ): Promise<FacultadElegible> {
    return this.universidades.editarFacultad(
      this.superadmin(req),
      id,
      datos.nombre,
    )
  }

  @Puede('update', 'Facultad')
  @Patch('facultades/:id/archivar')
  @HttpCode(204)
  archivarFacultad(
    @Req() req: RequestConUsuario,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.universidades.archivarFacultad(this.superadmin(req), id)
  }
}
