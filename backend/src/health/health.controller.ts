import { Controller, Get, ServiceUnavailableException } from '@nestjs/common'
import { Public } from '../auth/publico.decorator.js'
import { HealthService } from './health.service.js'

export interface EstadoProceso {
  status: 'ok'
}

export interface EstadoBaseDeDatos {
  status: 'ok' | 'error'
  database: 'ok' | 'error'
}

// Sin sesión: lo consultan el contenedor, ECS y el workflow de deploy.
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  // Lo usan el health check del contenedor y el circuit breaker de ECS. No
  // consulta la base, para que una caída de la base no reinicie las tareas.
  @Get()
  vivo(): EstadoProceso {
    return { status: 'ok' }
  }

  // Lo usa la verificación final del workflow de deploy.
  @Get('db')
  async baseDeDatos(): Promise<EstadoBaseDeDatos> {
    if (!(await this.healthService.baseDeDatosResponde())) {
      throw new ServiceUnavailableException({
        status: 'error',
        database: 'error',
      } satisfies EstadoBaseDeDatos)
    }
    return { status: 'ok', database: 'ok' }
  }
}
