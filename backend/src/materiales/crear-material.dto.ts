import {
  CATEGORIAS_MATERIAL,
  type CategoriaMaterial,
  type CrearMaterial,
  LARGO_DESCRIPCION_MATERIAL,
  LARGO_TITULO_MATERIAL,
} from '@cursus/shared'
import { Transform } from 'class-transformer'
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator'

// Body de POST /api/espacio/secciones/:id/materiales (MAT-04). La base vuelve
// a revisar la categoría, el título y la descripción con ck_material_*.
export class CrearMaterialDto implements CrearMaterial {
  @IsUUID()
  archivoId!: string

  @IsIn(CATEGORIAS_MATERIAL)
  categoria!: CategoriaMaterial

  // Una sola línea: sin espacios repetidos ni caracteres de control
  // (PostgreSQL rechaza el NUL y respondería 500).
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().replace(/\s+/gu, ' ') : value,
  )
  @IsString()
  @IsNotEmpty({ message: 'Ingresa el título del material' })
  @MaxLength(LARGO_TITULO_MATERIAL)
  // * y no +: el vacío lo informa @IsNotEmpty, con su propio mensaje.
  @Matches(/^\P{Cc}*$/u, {
    message: 'titulo no puede tener caracteres de control',
  })
  titulo!: string

  // Opcional. Puede tener varias líneas y tabulaciones, pero ningún otro
  // carácter de control. Una descripción vacía o solo de espacios es lo mismo
  // que no enviarla.
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value
    return value.trim() === '' ? undefined : value.trim()
  })
  @IsOptional()
  @IsString()
  @MaxLength(LARGO_DESCRIPCION_MATERIAL)
  @Matches(/^(?:[\t\n\r]|\P{Cc})*$/u, {
    message: 'descripcion no puede tener caracteres de control',
  })
  descripcion?: string
}
