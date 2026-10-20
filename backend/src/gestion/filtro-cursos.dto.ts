import type { FiltroCursos } from '@cursus/shared'
import { IsOptional, IsUUID } from 'class-validator'

// Query de GET /api/cursos (GES-04). Los dos filtros son opcionales y se
// pueden combinar; un id que no es uuid responde 400.
export class FiltroCursosDto implements FiltroCursos {
  @IsOptional()
  @IsUUID()
  carreraId?: string

  @IsOptional()
  @IsUUID()
  periodoId?: string
}
