import {
  MAX_ANUNCIOS_LECTURA,
  type RegistrarLecturaAnuncios,
} from '@cursus/shared'
import { ArrayMaxSize, ArrayUnique, IsArray, IsUUID } from 'class-validator'

export class RegistrarLecturaDto implements RegistrarLecturaAnuncios {
  @IsArray()
  @ArrayMaxSize(MAX_ANUNCIOS_LECTURA)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  anuncioIds!: string[]
}
