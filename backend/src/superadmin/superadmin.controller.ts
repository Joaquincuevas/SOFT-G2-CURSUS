import type { UniversidadElegible, UsuarioSesion } from '@cursus/shared'
import {
  Body,
  Controller,
  Delete,
  Get,
  Put,
  Req,
  UnauthorizedException,
} from '@nestjs/common'
import { AuthService } from '../auth/auth.service.js'
import type { RequestConUsuario } from '../auth/jwt-auth.guard.js'
import { Puede } from '../auth/permisos.decorator.js'
import { contextoDeLaSesion } from '../auth/universidad-actual.decorator.js'
import { ElegirContextoDto } from './elegir-contexto.dto.js'
import { SuperadminService } from './superadmin.service.js'

// MT-04 (ADR 0002): panel del superadmin. Desde el Dashboard elige una
// universidad y una facultad, puede cambiarlas en cualquier momento y puede
// salir de ellas para volver a la vista global.
@Controller('superadmin')
export class SuperadminController {
  constructor(
    private readonly superadmin: SuperadminService,
    private readonly auth: AuthService,
  ) {}

  @Puede('read', 'PanelSuperadmin')
  @Get('universidades')
  listarUniversidades(
    @Req() req: RequestConUsuario,
  ): Promise<UniversidadElegible[]> {
    return this.superadmin.listarUniversidades(req.usuario?.rol)
  }

  // Elegir no modifica datos institucionales, solo la sesión: por eso exige
  // el mismo permiso que el panel. Rige desde esta respuesta, que trae el
  // usuario de la sesión con la universidad y la facultad nuevas.
  @Puede('read', 'PanelSuperadmin')
  @Put('contexto')
  async elegir(
    @Req() req: RequestConUsuario,
    @Body() datos: ElegirContextoDto,
  ): Promise<UsuarioSesion> {
    const { sub, sid, rol } = req.usuario ?? {}
    if (!sub || !sid) {
      throw new UnauthorizedException()
    }
    const eleccion = {
      universidadId: datos.universidadId.toLowerCase(),
      facultadId: datos.facultadId.toLowerCase(),
    }
    await this.superadmin.verificarEleccion(rol, eleccion)
    await this.auth.guardarEleccion(sid, sub, eleccion)
    req.eleccion = eleccion
    const usuario = await this.auth.obtenerSuperadmin(
      sub,
      contextoDeLaSesion(req),
    )
    if (!usuario) {
      throw new UnauthorizedException()
    }
    return usuario
  }

  // Salir de la universidad: quita la elección de la sesión, no borra datos.
  // Desde esta respuesta las rutas del Administrativo vuelven a responder 403
  // hasta que elija otra.
  @Puede('read', 'PanelSuperadmin')
  @Delete('contexto')
  async salir(@Req() req: RequestConUsuario): Promise<UsuarioSesion> {
    const { sub, sid } = req.usuario ?? {}
    if (!sub || !sid) {
      throw new UnauthorizedException()
    }
    await this.auth.limpiarEleccion(sid, sub)
    req.eleccion = undefined
    const usuario = await this.auth.obtenerSuperadmin(sub, null)
    if (!usuario) {
      throw new UnauthorizedException()
    }
    return usuario
  }
}
