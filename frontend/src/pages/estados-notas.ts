import type { EstadoRevisionNotas } from '@cursus/shared'

export const ESTADO_REVISION: Record<EstadoRevisionNotas, string> = {
  BORRADOR: 'Borrador',
  EN_REVISION: 'En revisión',
  APROBADA: 'Aprobada',
  DEVUELTA: 'Devuelta',
}
