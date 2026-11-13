import { type ConfirmarMfa, DIGITOS_CODIGO_MFA } from '@cursus/shared'
import { Transform } from 'class-transformer'
import { IsString, Matches } from 'class-validator'

// Las apps muestran el código como «123 456»: se quitan los espacios antes de
// validar.
const sinEspacios = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.replace(/\s/g, '') : value

// Body de POST /api/perfil/mfa/confirmacion (SEG-01).
export class ConfirmarMfaDto implements ConfirmarMfa {
  @Transform(sinEspacios)
  @IsString()
  @Matches(new RegExp(`^\\d{${DIGITOS_CODIGO_MFA}}$`), {
    message: `El código debe tener ${DIGITOS_CODIGO_MFA} dígitos`,
  })
  codigo!: string
}
