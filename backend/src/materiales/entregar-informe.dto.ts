import type { EntregarInforme } from '@cursus/shared'
import { IsUUID } from 'class-validator'

export class EntregarInformeDto implements EntregarInforme {
  @IsUUID('all', { message: 'El archivo debe ser un identificador válido' })
  archivoId!: string
}
