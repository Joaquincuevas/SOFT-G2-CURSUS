import { MAX_BYTES_ARCHIVO_CSV, type CargarAlumnosCsv } from '@cursus/shared'
import { IsString, MaxLength } from 'class-validator'

export class CargarAlumnosDto implements CargarAlumnosCsv {
  @IsString()
  // Tope de caracteres; los límites en bytes los aplica leerCsvAlumnos.
  @MaxLength(MAX_BYTES_ARCHIVO_CSV)
  csv!: string
}
