import {
  MAX_TAMANO_SILABO_BYTES,
  type Rol,
  type SeccionEspacio,
  type VersionSilabo,
} from '@cursus/shared'
import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Req,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import type { RequestConUsuario } from '../auth/jwt-auth.guard.js'
import { Puede } from '../auth/permisos.decorator.js'
import { UniversidadActual } from '../auth/universidad-actual.decorator.js'
import type { ContextoUniversidad } from '../database/base-de-datos.service.js'
import {
  IntegranteDeSeccion,
  SeccionActual,
} from '../espacio/integrante-seccion.guard.js'
import { SilaboService } from './silabo.service.js'

const ROLES_LECTURA: readonly Rol[] = [
  'PROFESOR',
  'AYUDANTE',
  'ALUMNO',
  'DIRECTOR',
]

@Controller('espacio/secciones/:id/silabo')
export class SilaboController {
  constructor(private readonly silabo: SilaboService) {}

  @Puede('read', 'Silabo')
  @IntegranteDeSeccion()
  @Get()
  listar(
    @UniversidadActual() contexto: ContextoUniversidad,
    @SeccionActual() seccion: SeccionEspacio,
  ): Promise<VersionSilabo[]> {
    if (!ROLES_LECTURA.includes(seccion.rol)) throw new ForbiddenException()
    return this.silabo.listar(contexto, seccion)
  }

  @Puede('read', 'Silabo')
  @IntegranteDeSeccion()
  @Get(':version')
  async descargar(
    @UniversidadActual() contexto: ContextoUniversidad,
    @SeccionActual() seccion: SeccionEspacio,
    @Param('version', ParseIntPipe) version: number,
  ): Promise<StreamableFile> {
    if (!ROLES_LECTURA.includes(seccion.rol)) throw new ForbiddenException()
    const pdf = await this.silabo.obtener(contexto, seccion, version)
    return new StreamableFile(pdf, {
      type: 'application/pdf',
      disposition: `attachment; filename="silabo-v${version}.pdf"`,
      length: pdf.byteLength,
    })
  }

  @Puede('create', 'Silabo')
  @IntegranteDeSeccion()
  @UseInterceptors(
    FileInterceptor('archivo', {
      limits: { fileSize: MAX_TAMANO_SILABO_BYTES },
    }),
  )
  @Post()
  @HttpCode(201)
  subir(
    @UniversidadActual() contexto: ContextoUniversidad,
    @Req() req: RequestConUsuario,
    @SeccionActual() seccion: SeccionEspacio,
    @UploadedFile() archivo: { mimetype: string; buffer: Buffer } | undefined,
  ): Promise<VersionSilabo> {
    if (seccion.rol !== 'PROFESOR') {
      throw new ForbiddenException('Solo el profesor del curso carga el sílabo')
    }
    if (!archivo?.buffer?.length) {
      throw new BadRequestException('Selecciona un archivo PDF')
    }
    if (
      archivo.mimetype !== 'application/pdf' ||
      archivo.buffer.subarray(0, 5).toString('ascii') !== '%PDF-'
    ) {
      throw new BadRequestException('El archivo debe ser un PDF válido')
    }
    const usuarioId = req.usuario?.sub
    if (!usuarioId) throw new ForbiddenException()
    return this.silabo.subir(contexto, usuarioId, seccion, archivo.buffer)
  }
}
