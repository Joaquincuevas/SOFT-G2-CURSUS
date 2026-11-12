import type { CuentaCreada, CuentaUniversidad } from '@cursus/shared'
import {
  Body,
  Controller,
  Get,
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
import { CuentasService } from './cuentas.service.js'
import { GuardarCuentaDto } from './guardar-cuenta.dto.js'
import type { Superadmin } from './universidades.service.js'

// GES-24: el superadmin administra las cuentas de una universidad desde su
// vista global, sin elegir facultad. Los permisos son sobre Universidad y no
// sobre Usuario, que también tiene el Administrativo en su facultad.
@Controller('superadmin/universidades/:id/cuentas')
export class CuentasController {
  constructor(private readonly cuentas: CuentasService) {}

  private superadmin(req: RequestConUsuario): Superadmin {
    if (!req.usuario?.sub) throw new UnauthorizedException()
    return { id: req.usuario.sub, rol: req.usuario.rol }
  }

  @Puede('update', 'Universidad')
  @Get()
  listar(
    @Req() req: RequestConUsuario,
    @Param('id', ParseUUIDPipe) universidadId: string,
  ): Promise<CuentaUniversidad[]> {
    return this.cuentas.listar(this.superadmin(req), universidadId)
  }

  @Puede('create', 'Universidad')
  @Post()
  crear(
    @Req() req: RequestConUsuario,
    @Param('id', ParseUUIDPipe) universidadId: string,
    @Body() datos: GuardarCuentaDto,
  ): Promise<CuentaCreada> {
    return this.cuentas.crear(this.superadmin(req), universidadId, datos)
  }

  @Puede('update', 'Universidad')
  @Patch(':cuentaId')
  editar(
    @Req() req: RequestConUsuario,
    @Param('id', ParseUUIDPipe) universidadId: string,
    @Param('cuentaId', ParseUUIDPipe) cuentaId: string,
    @Body() datos: GuardarCuentaDto,
  ): Promise<CuentaUniversidad> {
    return this.cuentas.editar(
      this.superadmin(req),
      universidadId,
      cuentaId,
      datos,
    )
  }

  @Puede('update', 'Universidad')
  @Patch(':cuentaId/egresar')
  @HttpCode(204)
  egresar(
    @Req() req: RequestConUsuario,
    @Param('id', ParseUUIDPipe) universidadId: string,
    @Param('cuentaId', ParseUUIDPipe) cuentaId: string,
  ): Promise<void> {
    return this.cuentas.egresar(this.superadmin(req), universidadId, cuentaId)
  }

  @Puede('update', 'Universidad')
  @Patch(':cuentaId/archivar')
  @HttpCode(204)
  archivar(
    @Req() req: RequestConUsuario,
    @Param('id', ParseUUIDPipe) universidadId: string,
    @Param('cuentaId', ParseUUIDPipe) cuentaId: string,
  ): Promise<void> {
    return this.cuentas.archivar(this.superadmin(req), universidadId, cuentaId)
  }
}
