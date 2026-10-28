import type { ElegirContexto } from '@cursus/shared'
import { IsUUID } from 'class-validator'

// Body de PUT /api/superadmin/contexto (MT-04).
export class ElegirContextoDto implements ElegirContexto {
  @IsUUID()
  universidadId!: string

  @IsUUID()
  facultadId!: string
}
