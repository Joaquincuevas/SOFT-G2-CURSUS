import { LARGO_NOMBRE_CARRERA } from '@cursus/shared'
import { Transform } from 'class-transformer'
import { IsNotEmpty, IsString, MaxLength } from 'class-validator'

export class NombreCarreraDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().replace(/\s+/gu, ' ') : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(LARGO_NOMBRE_CARRERA)
  nombre!: string
}
