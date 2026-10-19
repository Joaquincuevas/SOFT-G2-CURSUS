import type { CrearCurso } from '@cursus/shared'
import { Transform } from 'class-transformer'
import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator'

const sinEspacios = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value
const enMayusculas = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value

// Body de POST /api/cursos. El código se guarda sin espacios y en mayúsculas,
// para que "icc101" e "ICC101" choquen en el mismo período.
export class CrearCursoDto implements CrearCurso {
  @Transform(enMayusculas)
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  codigo!: string

  @Transform(sinEspacios)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  nombre!: string

  @IsUUID()
  carreraId!: string

  @IsUUID()
  periodoId!: string
}
