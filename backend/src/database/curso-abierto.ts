import { ForbiddenException } from '@nestjs/common'
import type { BaseDeDatos } from './base-de-datos.service.js'

export async function exigirCursoAbierto(
  bd: Pick<BaseDeDatos, 'query'>,
  seccionId: string,
): Promise<void> {
  const [{ abierto }] = await bd.query<{ abierto: boolean }>(
    'SELECT public.registro_academico_abierto($1) AS abierto',
    [seccionId],
  )
  if (!abierto) throw new ForbiddenException('Curso cerrado')
}
