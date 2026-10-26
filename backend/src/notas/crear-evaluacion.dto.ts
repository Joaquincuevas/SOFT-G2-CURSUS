import {
  LARGO_NOMBRE_EVALUACION,
  PONDERACION_MAXIMA,
  PONDERACION_MINIMA,
} from '@cursus/shared'
import { Transform } from 'class-transformer'
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator'

// NOT-01: los tres campos son obligatorios. La ponderación es un porcentaje
// entero; la base la vuelve a revisar con ck_evaluacion_ponderacion.
export class CrearEvaluacionDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().replace(/\s+/gu, ' ') : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(LARGO_NOMBRE_EVALUACION)
  // Sin caracteres de control: PostgreSQL rechaza el NUL y respondería 500.
  @Matches(/^\P{Cc}+$/u, {
    message: 'nombre no puede tener caracteres de control',
  })
  nombre!: string

  @IsDateString({ strict: true })
  @Matches(/^(?!0000)\d{4}-\d{2}-\d{2}$/)
  fecha!: string

  @IsInt()
  @Min(PONDERACION_MINIMA)
  @Max(PONDERACION_MAXIMA)
  ponderacion!: number
}
