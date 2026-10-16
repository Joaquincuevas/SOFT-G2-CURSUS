import { Injectable, type OnModuleDestroy } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { opcionesDataSource } from './data-source.js'

// Conexión compartida para las consultas de la API. Se abre en la primera
// consulta y no al arrancar, para que la API levante aunque la base no esté
// disponible (health tiene su propia conexión con timeout corto).
@Injectable()
export class BaseDeDatos implements OnModuleDestroy {
  private conexion?: Promise<DataSource>

  async query<T>(sql: string, parametros: unknown[] = []): Promise<T[]> {
    this.conexion ??= new DataSource(opcionesDataSource()).initialize()
    try {
      return await (await this.conexion).query(sql, parametros)
    } catch (error) {
      // Si la conexión no se pudo abrir, se reintenta desde cero la próxima vez.
      const bd = await this.conexion.catch(() => undefined)
      if (!bd?.isInitialized) {
        this.conexion = undefined
      }
      throw error
    }
  }

  async onModuleDestroy() {
    const bd = await this.conexion?.catch(() => undefined)
    if (bd?.isInitialized) {
      await bd.destroy()
    }
  }
}
