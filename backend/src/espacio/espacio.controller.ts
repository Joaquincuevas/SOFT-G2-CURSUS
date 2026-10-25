import type {
  AlumnosEspacio,
  SeccionEspacio,
  SeccionResumen,
} from '@cursus/shared'
import { Controller, ForbiddenException, Get } from '@nestjs/common'
import { Puede } from '../auth/permisos.decorator.js'
import { UniversidadActual } from '../auth/universidad-actual.decorator.js'
import type { ContextoUniversidad } from '../database/base-de-datos.service.js'
import {
  IntegranteDeSeccion,
  SeccionActual,
} from './integrante-seccion.guard.js'
import { AlumnosSeccionService } from './alumnos-seccion.service.js'
import { ResumenSeccionService } from './resumen-seccion.service.js'

// Espacio de una sección: solo para sus integrantes (ESP-06). Las rutas que
// se agreguen aquí (ESP-04, ESP-05, notas, material...) llevan los mismos dos
// decoradores.
@Controller('espacio/secciones/:id')
export class EspacioController {
  constructor(
    private readonly resumen: ResumenSeccionService,
    private readonly alumnos: AlumnosSeccionService,
  ) {}

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

  // ESP-05 (RN-06): nombre y correo de los alumnos inscritos, solo para el
  // profesor de la sección. El resto recibe 403: un alumno no ve los correos
  // de sus compañeros (RE-10), el ayudante tampoco por ahora (se reevalúa en
  // F4), y el Administrativo y el Director tienen la lista de gestión
  // (GES-18).
  @Puede('read', 'Seccion')
  @IntegranteDeSeccion()
  @Get('alumnos')
  listarAlumnos(
    @UniversidadActual() contexto: ContextoUniversidad,
    @SeccionActual() seccion: SeccionEspacio,
  ): Promise<AlumnosEspacio> {
    if (seccion.rol !== 'PROFESOR') {
      throw new ForbiddenException(
        'Solo el profesor de la sección ve la lista de alumnos',
      )
    }
    return this.alumnos.listar(contexto, seccion)
  }
}
