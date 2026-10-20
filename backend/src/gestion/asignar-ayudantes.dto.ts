import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsUUID,
} from 'class-validator'
import type { AsignarAyudantes } from '@cursus/shared'

export class AsignarAyudantesDto implements AsignarAyudantes {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  ayudanteIds!: string[]
}
