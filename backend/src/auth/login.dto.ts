import { IsNotEmpty, IsString, MaxLength } from 'class-validator'

// Argon2 procesa la contraseña completa: se limita su largo para que una
// petición no pueda consumir CPU con textos enormes.
const LARGO_MAXIMO = 256

// Body de POST /api/auth/login. No se exige formato de correo: un correo con
// formato extraño responde 401 como cualquier credencial inválida.
export class LoginDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(LARGO_MAXIMO)
  correo!: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(LARGO_MAXIMO)
  password!: string
}
