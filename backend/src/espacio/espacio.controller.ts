import type { SeccionEspacio, SeccionResumen } from '@cursus/shared'
import { Controller, Get } from '@nestjs/common'
import { Puede } from '../auth/permisos.decorator.js'
import { UniversidadActual } from '../auth/universidad-actual.decorator.js'
import type { ContextoUniversidad } from '../database/base-de-datos.service.js'
import {
  IntegranteDeSeccion,
  SeccionActual,
} from './integrante-seccion.guard.js'
import { ResumenSeccionService } from './resumen-seccion.service.js'

// Espacio de una sección: solo para sus integrantes (ESP-06). Las rutas que
// se agreguen aquí (ESP-04, ESP-05, notas, material...) llevan los mismos dos
// decoradores.
@Controller('espacio/secciones/:id')
export class EspacioController {
  constructor(private readonly resumen: ResumenSeccionService) {}

  @Puede('read', 'Seccion')
  @IntegranteDeSeccion()
  @Get()
  obtenerSeccion(@SeccionActual() seccion: SeccionEspacio): SeccionEspacio {
    return seccion
  }

  // ESP-04 (RE-04): horario, sala y equipo docente, para la vista de la
  // sección.
  @Puede('read', 'Seccion')
  @IntegranteDeSeccion()
  @Get('resumen')
  obtenerResumen(
    @UniversidadActual() contexto: ContextoUniversidad,
    @SeccionActual() seccion: SeccionEspacio,
  ): Promise<SeccionResumen> {
    return this.resumen.obtener(contexto, seccion)
  }
}
