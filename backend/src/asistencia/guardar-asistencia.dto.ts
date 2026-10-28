import { MAX_MARCAS_ASISTENCIA } from '@cursus/shared'
import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsUUID,
  ValidateNested,
} from 'class-validator'

class MarcaAsistenciaDto {
  @IsUUID('all')
  alumnoId!: string

  @IsBoolean()
  presente!: boolean
}

// ASI-02: una marca por alumno. Que la lista coincida con los alumnos
// activos de la sección (sin faltantes, sobrantes ni repetidos) lo revisa el
// servicio, que conoce la sección.
export class GuardarAsistenciaDto {
  @IsArray()
  @ArrayMaxSize(MAX_MARCAS_ASISTENCIA)
  @ValidateNested({ each: true })
  @Type(() => MarcaAsistenciaDto)
  marcas!: MarcaAsistenciaDto[]
}
