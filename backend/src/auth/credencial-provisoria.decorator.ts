import { SetMetadata } from '@nestjs/common'

export const PERMITIDA_CON_PROVISORIA = 'permitidaConProvisoria'

// PER-03. Marca una ruta como accesible para un usuario que todavía tiene la
// contraseña provisoria. El resto de las rutas con sesión responde 403 hasta
// que la cambie (ver JwtAuthGuard).
export const PermitidaConProvisoria = () =>
  SetMetadata(PERMITIDA_CON_PROVISORIA, true)
