import { Transform } from 'class-transformer'
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator'

// Body de POST /api/auth/login/mfa (SEG-02): el desafío del paso 1 y el código
// de 6 dígitos de la app. Los espacios se ignoran: las apps lo muestran como
// «123 456». Un JWT mide unos 250 caracteres; el tope evita textos enormes.
export class LoginMfaDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  desafio!: string

  @Transform(({ value }: { value: unknown }): unknown =>
    typeof value === 'string' ? value.replace(/\s/g, '') : value,
  )
  @IsString()
  @Matches(/^\d{6}$/, { message: 'El código debe tener 6 dígitos' })
  codigo!: string
}
