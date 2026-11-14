import { LARGO_MAXIMO_PASSWORD, LARGO_MINIMO_PASSWORD } from '@cursus/shared'
import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
} from '@nestjs/common'
import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator'
import { setTimeout as esperar } from 'node:timers/promises'
import { ipLogin, type RequestLogin } from './ip-login.js'
import { Public } from './publico.decorator.js'
import { RecuperacionService } from './recuperacion.service.js'

class SolicitarRecuperacionDto {
  @IsEmail()
  @MaxLength(254)
  correo!: string
}

class RestablecerPasswordDto {
  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  token!: string

  @IsString()
  @MinLength(LARGO_MINIMO_PASSWORD)
  @MaxLength(LARGO_MAXIMO_PASSWORD)
  passwordNueva!: string
}

@Public()
@Controller('auth')
export class RecuperacionController {
  constructor(private readonly recuperacion: RecuperacionService) {}

  @Post('recuperar-password')
  @HttpCode(204)
  async solicitar(
    @Body() datos: SolicitarRecuperacionDto,
    @Req() req: RequestLogin,
  ) {
    const ip = ipLogin(req)
    await Promise.all([
      this.recuperacion.solicitar(datos.correo, ip),
      esperar(2500),
    ])
  }

  @Post('restablecer-password')
  @HttpCode(204)
  async restablecer(@Body() { token, passwordNueva }: RestablecerPasswordDto) {
    if (!(await this.recuperacion.restablecer(token, passwordNueva))) {
      throw new BadRequestException(
        'El enlace es inválido o expiró. Solicita uno nuevo.',
      )
    }
  }
}
