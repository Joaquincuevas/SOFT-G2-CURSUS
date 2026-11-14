import {
  TAMANO_MAXIMO_EVENTOS,
  TIPOS_EVENTO,
  type FiltroEventos,
  type TipoEvento,
} from '@cursus/shared'
import { Type } from 'class-transformer'
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator'

// Con zona horaria explícita (Z o ±hh:mm): sin ella el instante dependería de
// la zona del servidor.
const CON_ZONA = /(Z|[+-]\d{2}:\d{2})$/

// Query de GET /api/auditoria/eventos (SEG-05). Todo es opcional; un valor
// inválido responde 400 y el tamaño de página tiene máximo.
export class FiltroEventosDto implements FiltroEventos {
  @IsOptional()
  @IsUUID()
  usuarioId?: string

  @IsOptional()
  @IsUUID()
  universidadId?: string

  @IsOptional()
  @IsIn(TIPOS_EVENTO)
  tipo?: TipoEvento

  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(CON_ZONA, { message: 'desde debe incluir la zona horaria' })
  desde?: string

  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(CON_ZONA, { message: 'hasta debe incluir la zona horaria' })
  hasta?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100_000)
  pagina?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(TAMANO_MAXIMO_EVENTOS)
  tamano?: number
}
