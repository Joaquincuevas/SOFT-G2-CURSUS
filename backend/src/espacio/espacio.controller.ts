import type { SeccionEspacio } from '@cursus/shared'
import { Controller, Get } from '@nestjs/common'
import { Puede } from '../auth/permisos.decorator.js'
import {
  IntegranteDeSeccion,
  SeccionActual,
} from './integrante-seccion.guard.js'

// Espacio de una sección: solo para sus integrantes (ESP-06). Las rutas que
// se agreguen aquí (ESP-04, ESP-05, notas, material...) llevan los mismos dos
// decoradores.
@Controller('espacio/secciones/:id')
export class EspacioController {
  @Puede('read', 'Seccion')
  @IntegranteDeSeccion()
  @Get()
  obtenerSeccion(@SeccionActual() seccion: SeccionEspacio): SeccionEspacio {
    return seccion
  }
}
