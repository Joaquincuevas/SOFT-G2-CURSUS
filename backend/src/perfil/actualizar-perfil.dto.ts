import { type ActualizarPerfil, LARGO_NOMBRE_USUARIO } from '@cursus/shared'
import { Transform } from 'class-transformer'
import { IsNotEmpty, IsString, MaxLength } from 'class-validator'

const sinEspacios = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value

// Body de PATCH /api/perfil (PER-01). Solo el nombre: cualquier otro campo
// (correo, rol, universidad) responde 400 por el ValidationPipe global.
export class ActualizarPerfilDto implements ActualizarPerfil {
  @Transform(sinEspacios)
  @IsString()
  @IsNotEmpty()
  @MaxLength(LARGO_NOMBRE_USUARIO)
  nombre!: string
}
