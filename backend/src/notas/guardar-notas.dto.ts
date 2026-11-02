import { MAX_NOTAS_GUARDADO } from '@cursus/shared'
import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsDefined,
  IsUUID,
  ValidateNested,
} from 'class-validator'

class NotaAlumnoDto {
  @IsUUID('all')
  alumnoId!: string

  // Solo se exige que venga: que sea una nota de 1,0 a 7,0 lo revisa el
  // servicio antes de escribir, para responder siempre "Nota inválida".
  @IsDefined()
  nota!: unknown
}

// NOT-05: notas de cualquier subconjunto de los alumnos activos. Que estén
// inscritos y no se repitan lo revisa el servicio, que conoce la sección.
export class GuardarNotasDto {
  @IsArray()
  @ArrayMaxSize(MAX_NOTAS_GUARDADO)
  @ValidateNested({ each: true })
  @Type(() => NotaAlumnoDto)
  notas!: NotaAlumnoDto[]
}
