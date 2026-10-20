import { LARGO_SALA, MAX_BLOQUES_HORARIO } from '@cursus/shared'
import type { BloqueHorario, DiaSemana, GuardarHorario } from '@cursus/shared'
import { Transform, Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator'

export class BloqueHorarioDto implements BloqueHorario {
  @IsInt()
  @Min(1)
  @Max(7)
  dia!: DiaSemana

  @Matches(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
  inicio!: string

  @Matches(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
  termino!: string

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(LARGO_SALA)
  sala!: string
}

export class GuardarHorarioDto implements GuardarHorario {
  @IsInt()
  @Min(0)
  @Max(2147483646)
  version!: number

  @IsArray()
  @ArrayMaxSize(MAX_BLOQUES_HORARIO)
  @ValidateNested({ each: true })
  @Type(() => BloqueHorarioDto)
  bloques!: BloqueHorarioDto[]
}
