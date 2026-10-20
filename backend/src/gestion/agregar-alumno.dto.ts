import type { AgregarAlumno } from '@cursus/shared'
import { Transform } from 'class-transformer'
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator'

const enMinusculas = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value
// Un nombre vacío cuenta como no enviado.
const sinEspacios = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || undefined : value

// Body de POST /api/secciones/:id/alumnos (GES-15). El correo se guarda sin
// espacios y en minúsculas. El nombre solo se exige si hay que crear la
// cuenta; eso lo decide el servicio.
export class AgregarAlumnoDto implements AgregarAlumno {
  @Transform(enMinusculas)
  @IsEmail({}, { message: 'Ingresa un correo válido' })
  correo!: string

  @Transform(sinEspacios)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  nombre?: string
}
