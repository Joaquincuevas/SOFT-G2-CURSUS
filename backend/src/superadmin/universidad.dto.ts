import {
  type CrearUniversidad,
  type EditarUniversidad,
  FORMATO_COLOR,
  FORMATO_DOMINIO_CORREO,
  type GuardarFacultad,
  LARGO_DOMINIO_CORREO,
  LARGO_NOMBRE_FACULTAD,
  LARGO_NOMBRE_UNIVERSIDAD,
} from '@cursus/shared'
import { Transform } from 'class-transformer'
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator'

// GES-23: bodies de la gestión de universidades y facultades del superadmin.
// La base vuelve a revisar el formato (ck_universidad_dominio_correo y
// ck_universidad_color) y que los nombres no se repitan.

// Una sola línea, sin espacios repetidos.
const nombre = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().replace(/\s+/gu, ' ') : value
const minusculas = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value

export class CrearUniversidadDto implements CrearUniversidad {
  @Transform(nombre)
  @IsString()
  @IsNotEmpty({ message: 'Ingresa el nombre de la universidad' })
  @MaxLength(LARGO_NOMBRE_UNIVERSIDAD)
  nombre!: string

  @Transform(minusculas)
  @IsString()
  @MaxLength(LARGO_DOMINIO_CORREO)
  @Matches(FORMATO_DOMINIO_CORREO, {
    message: 'El dominio debe ser como universidad.cl, sin @',
  })
  dominioCorreo!: string

  @Transform(minusculas)
  @IsString()
  @Matches(FORMATO_COLOR, {
    message: 'El color debe tener el formato #rrggbb',
  })
  color!: string
}

// PATCH: solo los campos que cambian.
export class EditarUniversidadDto implements EditarUniversidad {
  @IsOptional()
  @Transform(nombre)
  @IsString()
  @IsNotEmpty({ message: 'Ingresa el nombre de la universidad' })
  @MaxLength(LARGO_NOMBRE_UNIVERSIDAD)
  nombre?: string

  @IsOptional()
  @Transform(minusculas)
  @IsString()
  @MaxLength(LARGO_DOMINIO_CORREO)
  @Matches(FORMATO_DOMINIO_CORREO, {
    message: 'El dominio debe ser como universidad.cl, sin @',
  })
  dominioCorreo?: string

  @IsOptional()
  @Transform(minusculas)
  @IsString()
  @Matches(FORMATO_COLOR, {
    message: 'El color debe tener el formato #rrggbb',
  })
  color?: string
}

export class GuardarFacultadDto implements GuardarFacultad {
  @Transform(nombre)
  @IsString()
  @IsNotEmpty({ message: 'Ingresa el nombre de la facultad' })
  @MaxLength(LARGO_NOMBRE_FACULTAD)
  nombre!: string
}
