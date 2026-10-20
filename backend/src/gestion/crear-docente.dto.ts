import {
  type CrearDocente,
  ROLES_DOCENTES,
  type RolDocente,
} from '@cursus/shared'
import { Transform } from 'class-transformer'
import { IsEmail, IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator'

const sinEspacios = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value
const enMinusculas = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value

// Body de POST /api/usuarios (GES-21). El correo se guarda sin espacios y en
// minúsculas. Solo se crean profesores y ayudantes: cualquier otro rol es 400.
export class CrearDocenteDto implements CrearDocente {
  @Transform(sinEspacios)
  @IsString()
  @IsNotEmpty({ message: 'Ingresa el nombre' })
  @MaxLength(120)
  nombre!: string

  @Transform(enMinusculas)
  @IsEmail({}, { message: 'Ingresa un correo válido' })
  correo!: string

  @IsIn(ROLES_DOCENTES, { message: 'El rol debe ser Profesor o Ayudante' })
  rol!: RolDocente
}
