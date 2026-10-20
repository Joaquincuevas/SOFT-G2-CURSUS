import { MAX_BYTES_ALUMNOS_CSV, type CargarAlumnosCsv } from '@cursus/shared'
import { IsString, MaxLength } from 'class-validator'

export class CargarAlumnosDto implements CargarAlumnosCsv {
  @IsString()
  @MaxLength(MAX_BYTES_ALUMNOS_CSV)
  csv!: string
}
