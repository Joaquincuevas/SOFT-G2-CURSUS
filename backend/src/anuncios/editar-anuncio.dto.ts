import type { EditarAnuncio } from '@cursus/shared'
import { ContenidoAnuncioDto } from './publicar-anuncio.dto.js'

export class EditarAnuncioDto
  extends ContenidoAnuncioDto
  implements EditarAnuncio {}
