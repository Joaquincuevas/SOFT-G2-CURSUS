import { SetMetadata } from '@nestjs/common'

export const ES_PUBLICO = 'esPublico'

// Marca una ruta o un controlador como accesible sin sesión. Todo lo demás
// exige un JWT válido (ver JwtAuthGuard).
export const Public = () => SetMetadata(ES_PUBLICO, true)
