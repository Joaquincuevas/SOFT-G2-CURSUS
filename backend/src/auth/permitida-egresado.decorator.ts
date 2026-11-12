import { SetMetadata } from '@nestjs/common'

export const PERMITIDA_EGRESADO = 'permitidaEgresado'
export const PermitidaEgresado = () => SetMetadata(PERMITIDA_EGRESADO, true)
