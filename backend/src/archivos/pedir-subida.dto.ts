import {
  LARGO_MAXIMO_NOMBRE_ARCHIVO,
  TAMANO_MAXIMO_ARCHIVO,
  TIPOS_ARCHIVO,
  type PedirSubida,
} from '@cursus/shared'
import { Transform } from 'class-transformer'
import {
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator'

const EXTENSIONES = Object.keys(TIPOS_ARCHIVO)

// Body de POST /api/espacio/secciones/:id/archivos (MAT-01). La base vuelve a
// revisar el nombre y el tamaño con ck_archivo_nombre y ck_archivo_tamano, y
// la firma de la subida exige ese tamaño exacto.
export class PedirSubidaDto implements PedirSubida {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty({ message: 'Indica el nombre del archivo' })
  @MaxLength(LARGO_MAXIMO_NOMBRE_ARCHIVO)
  // Sin caracteres de control (PostgreSQL rechaza el NUL) ni separadores de
  // ruta: el nombre es solo para mostrar y descargar.
  @Matches(/^[^\p{Cc}/\\]*$/u, {
    message: 'nombre no puede tener caracteres de control ni / o \\',
  })
  @Matches(new RegExp(`^.+\\.(?:${EXTENSIONES.join('|')})$`, 'iu'), {
    message: `Tipo de archivo no permitido. Se aceptan: ${EXTENSIONES.join(', ')}`,
  })
  nombre!: string

  @IsInt({ message: 'tamano debe ser un número entero de bytes' })
  @Min(1, { message: 'El archivo está vacío' })
  @Max(TAMANO_MAXIMO_ARCHIVO, {
    message: `El archivo puede pesar hasta ${TAMANO_MAXIMO_ARCHIVO / 1024 / 1024} MB`,
  })
  tamano!: number
}
