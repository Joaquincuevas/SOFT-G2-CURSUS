import {
  type CrearActividad,
  LARGO_INSTRUCCIONES_ACTIVIDAD,
  LARGO_TITULO_ACTIVIDAD,
} from '@cursus/shared'
import { Transform } from 'class-transformer'
import {
  IsDateString,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator'

// Body de POST /api/espacio/secciones/:id/actividades (MAT-08). Todos los
// campos son obligatorios. La base vuelve a revisar el título y las
// instrucciones con ck_actividad_titulo y ck_actividad_instrucciones.
export class CrearActividadDto implements CrearActividad {
  // Una sola línea: sin espacios repetidos ni caracteres de control
  // (PostgreSQL rechaza el NUL y respondería 500).
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().replace(/\s+/gu, ' ') : value,
  )
  @IsString()
  @IsNotEmpty({ message: 'Ingresa el título de la actividad' })
  @MaxLength(LARGO_TITULO_ACTIVIDAD)
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
  @IsNotEmpty({ message: 'Ingresa las instrucciones de la actividad' })
  @MaxLength(LARGO_INSTRUCCIONES_ACTIVIDAD)
  @Matches(/^(?:[\t\n\r]|\P{Cc})*$/u, {
    message: 'instrucciones no puede tener caracteres de control',
  })
  instrucciones!: string

  @IsDateString({ strict: true })
  @Matches(/^(?!0000)\d{4}-\d{2}-\d{2}$/)
  fecha!: string

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'hora debe tener el formato HH:mm',
  })
  hora!: string
}
