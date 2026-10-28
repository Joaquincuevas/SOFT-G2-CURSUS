import type { Anuncio, Rol, SeccionEspacio } from '@cursus/shared'
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
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
import { AnunciosService } from './anuncios.service.js'
import { PublicarAnuncioDto } from './publicar-anuncio.dto.js'
import { RegistrarLecturaDto } from './registrar-lectura.dto.js'

// Roles en la sección que leen sus anuncios. El Administrativo no (aunque
// pase IntegranteSeccionGuard por ser de la facultad del curso).
const LEEN: readonly Rol[] = ['PROFESOR', 'AYUDANTE', 'ALUMNO', 'DIRECTOR']

// ANU-01/02 (RN-09): anuncios del curso o sección, desde el espacio de una de sus
// secciones. Cada ruta exige además ser integrante (ESP-06); el rol que se
// revisa es el de la sección (@SeccionActual), no solo el de la cuenta.
@Controller('espacio/secciones/:id/anuncios')
export class AnunciosController {
  constructor(private readonly anuncios: AnunciosService) {}

  @Puede('read', 'Anuncio')
  @IntegranteDeSeccion()
  @Get()
  listar(
    @UniversidadActual() contexto: ContextoUniversidad,
    @SeccionActual() seccion: SeccionEspacio,
    @Req() req: RequestConUsuario,
  ): Promise<Anuncio[]> {
    if (!LEEN.includes(seccion.rol)) {
      throw new ForbiddenException()
    }
    return this.anuncios.listar(contexto, seccion, req.usuario?.sub as string)
  }

  @Puede('read', 'Anuncio')
  @IntegranteDeSeccion()
  @Post('lecturas')
  @HttpCode(204)
  registrarLectura(
    @UniversidadActual() contexto: ContextoUniversidad,
    @Req() req: RequestConUsuario,
    @SeccionActual() seccion: SeccionEspacio,
    @Body() datos: RegistrarLecturaDto,
  ): Promise<void> {
    return this.anuncios.registrarLectura(
      contexto,
      req.usuario?.sub as string,
      seccion,
      datos.anuncioIds,
    )
  }

  // Solo el profesor a cargo de la sección (cualquier profesor del curso
  // publica desde una de sus secciones): el resto de los integrantes, el
  // Administrativo y el Director reciben 403.
  @Puede('create', 'Anuncio')
  @IntegranteDeSeccion()
  @Post()
  @HttpCode(201)
  publicar(
    @UniversidadActual() contexto: ContextoUniversidad,
    @Req() req: RequestConUsuario,
    @SeccionActual() seccion: SeccionEspacio,
    @Body() datos: PublicarAnuncioDto,
  ): Promise<Anuncio> {
    if (seccion.rol !== 'PROFESOR') {
      throw new ForbiddenException(
        'Solo el profesor de la sección publica anuncios',
      )
    }
    return this.anuncios.publicar(
      contexto,
      req.usuario?.sub as string,
      seccion,
      datos,
    )
  }
}
