import {
  ROLES_INTEGRANTES,
  type AgregarIntegrante,
  type QuitarIntegrante,
  type RolIntegrante,
} from '@cursus/shared'
import { Transform } from 'class-transformer'
import { IsIn, IsString, IsUUID, MaxLength, MinLength } from 'class-validator'
import { QuitarAsignacionDto } from './quitar-asignacion.dto.js'

export class BuscarIntegrantesDto {
  @IsIn(ROLES_INTEGRANTES)
  rol!: RolIntegrante

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2, { message: 'Escribe al menos dos caracteres para buscar' })
  @MaxLength(150)
  q!: string
}
export class AgregarIntegranteDto implements AgregarIntegrante {
  @IsIn(ROLES_INTEGRANTES)
  rol!: RolIntegrante
  @IsUUID('all')
  usuarioId!: string
}
export class QuitarIntegranteDto
  extends QuitarAsignacionDto
  implements QuitarIntegrante
{
  @IsIn(ROLES_INTEGRANTES)
  rol!: RolIntegrante
}
