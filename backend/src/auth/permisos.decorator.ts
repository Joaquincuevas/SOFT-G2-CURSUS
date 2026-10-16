import type { Accion, Sujeto } from '@cursus/shared'
import { SetMetadata } from '@nestjs/common'

export const PERMISO = 'permiso'

export interface Permiso {
  accion: Accion
  sujeto: Sujeto
}

// Exige que el rol del usuario pueda hacer `accion` sobre `sujeto`, según las
// abilities de @cursus/shared. Si no puede, la ruta responde 403.
export const Puede = (accion: Accion, sujeto: Sujeto) =>
  SetMetadata(PERMISO, { accion, sujeto } satisfies Permiso)

// Marca una ruta como accesible para cualquier usuario con sesión, sin importar
// su rol. Una ruta sin @Puede(), @SoloSesion() ni @Public() responde 403.
export const SoloSesion = () => SetMetadata(PERMISO, 'sesion')
