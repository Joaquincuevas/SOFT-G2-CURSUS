import {
  LARGO_MOTIVO_ASIGNACION,
  type QuitarAsignacion,
  type QuitarProfesor,
} from '@cursus/shared'
import { Transform } from 'class-transformer'
import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator'

const sinEspaciosExtremos = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value

// Body de los PATCH .../quitar de GES-14. El motivo es obligatorio: queda en
// el historial de asignaciones. Se guarda sin espacios al inicio ni al final.
export class QuitarAsignacionDto implements QuitarAsignacion {
  @Transform(sinEspaciosExtremos)
  @IsString()
  @IsNotEmpty({ message: 'Escribe el motivo del cambio' })
  @MaxLength(LARGO_MOTIVO_ASIGNACION, {
    message: `El motivo puede tener hasta ${LARGO_MOTIVO_ASIGNACION} caracteres`,
  })
  motivo!: string
}

// Body de PATCH .../profesor/quitar: también el profesor que se confirmó
// quitar, para no quitar a otro si la sección cambió mientras tanto.
export class QuitarProfesorDto
  extends QuitarAsignacionDto
  implements QuitarProfesor
{
  @IsUUID('all', { message: 'Indica el profesor que quieres quitar' })
  profesorId!: string
}
