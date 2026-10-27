import { IsDateString, IsOptional, Matches } from 'class-validator'

// ASI-01: la fecha es opcional (por defecto, hoy en America/Santiago, en el
// backend) e `inicio` (HH:mm) elige el bloque del horario de ese día.
export class CrearClaseDto {
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^(?!0000)\d{4}-\d{2}-\d{2}$/)
  fecha?: string

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'inicio debe tener el formato HH:mm',
  })
  inicio!: string
}
