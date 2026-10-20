import {
  type CambiarPassword,
  LARGO_MAXIMO_PASSWORD,
  LARGO_MINIMO_PASSWORD,
} from '@cursus/shared'
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator'

// Body de PUT /api/auth/password (PER-02). Las contraseñas no se recortan: los
// espacios son parte de ellas.
export class CambiarPasswordDto implements CambiarPassword {
  @IsString()
  @IsNotEmpty()
  @MaxLength(LARGO_MAXIMO_PASSWORD)
  passwordActual!: string

  @IsString()
  @MinLength(LARGO_MINIMO_PASSWORD, {
    message: `La contraseña nueva debe tener al menos ${LARGO_MINIMO_PASSWORD} caracteres`,
  })
  @MaxLength(LARGO_MAXIMO_PASSWORD)
  passwordNueva!: string
}
