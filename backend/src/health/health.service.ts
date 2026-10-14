import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { opcionesDataSource } from '../database/data-source.js'

// La conexión se abre en la primera consulta y no al arrancar, para que la API
// levante aunque la base no esté disponible (por ejemplo, en los tests e2e).
@Injectable()
export class HealthService implements OnModuleDestroy {
  private readonly logger = new Logger(HealthService.name)
  private conexion?: Promise<DataSource>

  async baseDeDatosResponde(): Promise<boolean> {
    try {
      const bd = await this.obtenerConexion()
      await bd.query('SELECT 1')
      return true
    } catch (error) {
      // Se descarta la conexión para reintentar desde cero en la próxima consulta.
      void this.cerrar(this.conexion)
      this.conexion = undefined
      this.logger.warn(
        `La base de datos no responde: ${error instanceof Error ? error.message : String(error)}`,
      )
      return false
    }
  }

  async onModuleDestroy() {
    await this.cerrar(this.conexion)
  }

  private async cerrar(conexion?: Promise<DataSource>) {
    const bd = await conexion?.catch(() => undefined)
    if (bd?.isInitialized) {
      await bd.destroy().catch(() => undefined)
    }
  }

  private obtenerConexion(): Promise<DataSource> {
    // Timeout corto para responder antes que el health check del balanceador.
    this.conexion ??= new DataSource({
      ...opcionesDataSource(),
      poolSize: 1,
      connectTimeoutMS: 3000,
    }).initialize()
    return this.conexion
  }
}
