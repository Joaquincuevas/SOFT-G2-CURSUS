import {
  type GuardarCuenta,
  LARGO_NOMBRE_USUARIO,
  ROLES_CUENTA,
  type RolCuenta,
} from '@cursus/shared'
import { Transform } from 'class-transformer'
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator'

// Body para crear y editar una cuenta (GES-24). Que la facultad corresponda al
// rol lo revisa CuentasService, porque responde con un mensaje para el usuario.
export class GuardarCuentaDto implements GuardarCuenta {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().replace(/\s+/gu, ' ') : value,
  )
  @IsString()
  @IsNotEmpty({ message: 'Ingresa el nombre' })
  @MaxLength(LARGO_NOMBRE_USUARIO)
  // Sin caracteres de control: PostgreSQL rechaza el NUL y respondería 500.
  @Matches(/^\P{Cc}*$/u, {
    message: 'El nombre no puede tener caracteres de control',
  })
  nombre!: string

  // Se guarda sin espacios y en minúsculas.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'Ingresa un correo válido' })
  correo!: string

  @IsIn(ROLES_CUENTA, { message: 'Elige un rol válido' })
  rol!: RolCuenta

  @IsOptional()
  @IsUUID()
  facultadId?: string
}
