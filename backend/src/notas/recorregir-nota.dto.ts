import {
  LARGO_MOTIVO_NOTA,
  NOTA_MAXIMA,
  NOTA_MINIMA,
  type RecorregirNota,
} from '@cursus/shared'
import { Transform } from 'class-transformer'
import {
  IsNotEmpty,
  IsNumber,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator'

export class RecorregirNotaDto implements RecorregirNota {
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(NOTA_MINIMA)
  @Max(NOTA_MAXIMA)
  notaAnterior!: number

  @IsNumber(
    { maxDecimalPlaces: 1 },
    { message: 'La nota nueva debe tener a lo más un decimal' },
  )
  @Min(NOTA_MINIMA, { message: 'La nota nueva debe ser al menos 1,0' })
  @Max(NOTA_MAXIMA, { message: 'La nota nueva debe ser como máximo 7,0' })
  notaNueva!: number

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'El motivo es obligatorio' })
  @IsNotEmpty({ message: 'El motivo es obligatorio' })
  @Matches(new RegExp(`^[\\s\\S]{0,${LARGO_MOTIVO_NOTA}}$`, 'u'), {
    message: `El motivo puede tener hasta ${LARGO_MOTIVO_NOTA} caracteres`,
  })
  @Matches(/^(?:[\t\n\r]|\P{Cc})*$/u, {
    message: 'El motivo contiene caracteres no permitidos',
  })
  motivo!: string
}
