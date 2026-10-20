import type { PerfilActualizado } from '@cursus/shared'
import { Body, Controller, Patch, Req } from '@nestjs/common'
import type { RequestConUsuario } from '../auth/jwt-auth.guard.js'
import { SoloSesion } from '../auth/permisos.decorator.js'
import { UniversidadActual } from '../auth/universidad-actual.decorator.js'
import type { ContextoUniversidad } from '../database/base-de-datos.service.js'
import { ActualizarPerfilDto } from './actualizar-perfil.dto.js'
import { PerfilService } from './perfil.service.js'

// Perfil del usuario de la sesión (PER-01). Los datos se leen de
// GET /api/auth/yo; aquí solo se edita el nombre.
@Controller('perfil')
export class PerfilController {
  constructor(private readonly perfil: PerfilService) {}

  // Cualquier usuario con sesión edita solo su propio perfil (el id sale del
  // JWT), así que no aplica un permiso sobre Usuario.
  @SoloSesion()
  @Patch()
  actualizar(
    @UniversidadActual() contexto: ContextoUniversidad,
    @Req() req: RequestConUsuario,
    @Body() { nombre }: ActualizarPerfilDto,
  ): Promise<PerfilActualizado> {
    return this.perfil.actualizarNombre(
      contexto,
      req.usuario?.sub as string,
      nombre,
    )
  }
}
