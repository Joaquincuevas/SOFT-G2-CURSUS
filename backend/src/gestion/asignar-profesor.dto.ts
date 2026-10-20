import type { AsignarProfesor } from '@cursus/shared'
import { IsUUID } from 'class-validator'

// Body de PUT /api/secciones/:id/profesor (GES-12).
export class AsignarProfesorDto implements AsignarProfesor {
  @IsUUID()
  profesorId!: string
}
