import type { SeccionEspacio } from '@cursus/shared'
import {
  applyDecorators,
  BadRequestException,
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common'
import { isUUID } from 'class-validator'
import type { RequestConUsuario } from '../auth/jwt-auth.guard.js'
import { AccesoSeccionService } from './acceso-seccion.service.js'

type RequestConSeccion = RequestConUsuario & { seccion?: SeccionEspacio }

// Corre después de los guards globales (sesión y @Puede), así que el usuario
// ya está validado. Exige que sea integrante de la sección del parámetro :id
// y la deja en la petición para @SeccionActual().
@Injectable()
export class IntegranteSeccionGuard implements CanActivate {
  constructor(private readonly acceso: AccesoSeccionService) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const req = contexto.switchToHttp().getRequest<RequestConSeccion>()
    const { usuario } = req
    if (!usuario?.sub || !usuario.universidad_id || !usuario.rol) {
      throw new UnauthorizedException()
    }
    // Los pipes (ParseUUIDPipe) corren después de los guards.
    const seccionId = req.params.id
    if (typeof seccionId !== 'string' || !isUUID(seccionId)) {
      throw new BadRequestException('El id de la sección no es válido')
    }
    req.seccion = await this.acceso.verificar(
      { universidadId: usuario.universidad_id, rol: usuario.rol },
      usuario.sub,
      seccionId,
    )
    return true
  }
}

// Para las rutas del espacio de una sección (/secciones/:id/...): 403 si el
// usuario no es integrante. Se usa junto con @Puede('read', 'Seccion').
export const IntegranteDeSeccion = () =>
  applyDecorators(UseGuards(IntegranteSeccionGuard))

// Sección que verificó IntegranteSeccionGuard, con el rol del usuario en ella.
export const SeccionActual = createParamDecorator(
  (_dato: unknown, contexto: ExecutionContext): SeccionEspacio => {
    const { seccion } = contexto.switchToHttp().getRequest<RequestConSeccion>()
    if (!seccion) {
      throw new Error('Falta @IntegranteDeSeccion() en la ruta')
    }
    return seccion
  },
)
