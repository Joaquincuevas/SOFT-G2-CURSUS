import {
  LARGO_CUERPO_ANUNCIO,
  LARGO_TITULO_ANUNCIO,
  type PublicarAnuncio,
} from '@cursus/shared'
import { Transform } from 'class-transformer'
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator'

// Body de POST /api/espacio/secciones/:id/anuncios (ANU-01/02). Título y cuerpo
// son obligatorios: uno de solo espacios cuenta como vacío. La base los
// vuelve a revisar con ck_anuncio_titulo y ck_anuncio_cuerpo.
export class PublicarAnuncioDto implements PublicarAnuncio {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  @IsOptional()
  @IsUUID()
  seccionId?: string | null

  // Una sola línea: sin espacios repetidos ni caracteres de control
  // (PostgreSQL rechaza el NUL y respondería 500).
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().replace(/\s+/gu, ' ') : value,
  )
  @IsString()
  @IsNotEmpty({ message: 'Ingresa el título del anuncio' })
  @MaxLength(LARGO_TITULO_ANUNCIO)
  // * y no +: el vacío lo informa @IsNotEmpty, con su propio mensaje.
  @Matches(/^\P{Cc}*$/u, {
    message: 'titulo no puede tener caracteres de control',
  })
  titulo!: string

  // Puede tener varias líneas y tabulaciones, pero ningún otro carácter de
  // control.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty({ message: 'Ingresa el cuerpo del anuncio' })
  @MaxLength(LARGO_CUERPO_ANUNCIO)
  @Matches(/^(?:[\t\n\r]|\P{Cc})*$/u, {
    message: 'cuerpo no puede tener caracteres de control',
  })
  cuerpo!: string
}
