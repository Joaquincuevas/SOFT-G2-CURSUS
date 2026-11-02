import {
  LARGO_MOTIVO_ASISTENCIA,
  type CorregirAsistencia,
} from '@cursus/shared'
import { Transform } from 'class-transformer'
import {
  IsBoolean,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator'

export class CorregirAsistenciaDto implements CorregirAsistencia {
  @IsBoolean()
  anterior!: boolean

  @IsBoolean()
  presente!: boolean

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty({ message: 'El motivo es obligatorio' })
  @MaxLength(LARGO_MOTIVO_ASISTENCIA, {
    message: `El motivo puede tener hasta ${LARGO_MOTIVO_ASISTENCIA} caracteres`,
  })
  @Matches(/^(?:[\t\n\r]|\P{Cc})*$/u, {
    message: 'El motivo contiene caracteres no permitidos',
  })
  motivo!: string
}
