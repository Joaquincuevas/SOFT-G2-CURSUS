import { type DevolverNotas, LARGO_COMENTARIO_DEVOLUCION } from '@cursus/shared'
import { Transform } from 'class-transformer'
import { IsNotEmpty, IsString, Matches } from 'class-validator'

// NOT-12: body de POST .../notas/devolucion. El comentario se guarda sin
// espacios en los extremos. Como el motivo de ASI-04, admite saltos de línea
// y tabuladores, pero no otros caracteres de control.
export class DevolverNotasDto implements DevolverNotas {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'El comentario es obligatorio' })
  @IsNotEmpty({ message: 'El comentario es obligatorio' })
  // En caracteres, como length() de PostgreSQL y el CHECK de la base, no en
  // unidades UTF-16 ni como @MaxLength (que no cuenta los selectores de
  // variante: 500 "❤️" pasarían y el CHECK abortaría con un 500).
  @Matches(new RegExp(`^[\\s\\S]{0,${LARGO_COMENTARIO_DEVOLUCION}}$`, 'u'), {
    message: `El comentario puede tener hasta ${LARGO_COMENTARIO_DEVOLUCION} caracteres`,
  })
  @Matches(/^(?:[\t\n\r]|\P{Cc})*$/u, {
    message: 'El comentario contiene caracteres no permitidos',
  })
  comentario!: string
}
