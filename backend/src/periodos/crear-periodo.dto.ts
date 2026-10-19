import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  Matches,
  Max,
  Min,
} from 'class-validator'

export class CrearPeriodoDto {
  @IsInt()
  @Min(1)
  @Max(9999)
  anio!: number

  @IsInt()
  @IsIn([1, 2])
  semestre!: number

  @IsDateString({ strict: true })
  @Matches(/^(?!0000)\d{4}-\d{2}-\d{2}$/)
  fechaInicio!: string

  @IsDateString({ strict: true })
  @Matches(/^(?!0000)\d{4}-\d{2}-\d{2}$/)
  fechaTermino!: string

  @IsBoolean()
  activo = false
}
