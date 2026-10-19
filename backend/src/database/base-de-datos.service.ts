import {
  Injectable,
  NotFoundException,
  type OnModuleDestroy,
} from '@nestjs/common'
import { DataSource } from 'typeorm'
import { opcionesDataSource } from './data-source.js'

// $1 como parámetro completo: no confunde $10 o $11 con $1.
const USA_UNIVERSIDAD = /\$1(?!\d)/

// Conexión compartida para las consultas de la API. Se abre en la primera
// consulta y no al arrancar, para que la API levante aunque la base no esté
// disponible (health tiene su propia conexión con timeout corto).
@Injectable()
export class BaseDeDatos implements OnModuleDestroy {
  private conexion?: Promise<DataSource>

  async query<T>(sql: string, parametros: unknown[] = []): Promise<T[]> {
    return (await this.conectar()).query(sql, parametros)
  }

  async enTransaccion<T>(
    tarea: (bd: Pick<BaseDeDatos, 'query'>) => Promise<T>,
  ): Promise<T> {
    return (await this.conectar()).transaction((manager) =>
      tarea({
        query: <Fila>(sql: string, parametros: unknown[] = []) =>
          manager.query<Fila[]>(sql, parametros),
      }),
    )
  }

  private async conectar(): Promise<DataSource> {
    this.conexion ??= new DataSource(opcionesDataSource()).initialize()
    try {
      return await this.conexion
    } catch (error) {
      // Si la conexión no se pudo abrir, se reintenta desde cero la próxima vez.
      const bd = await this.conexion.catch(() => undefined)
      if (!bd?.isInitialized) {
        this.conexion = undefined
      }
      throw error
    }
  }

  // Consulta a tablas con datos institucionales, filtrada por la universidad
  // de la sesión (@UniversidadActual()). Por convención, $1 es siempre la
  // universidad y los demás parámetros siguen desde $2. Falla si la consulta
  // no usa $1, para que no se pueda olvidar el filtro.
  async consultarEnUniversidad<T>(
    universidadId: string,
    sql: string,
    parametros: unknown[] = [],
  ): Promise<T[]> {
    if (!universidadId) {
      throw new Error('Falta la universidad de la sesión')
    }
    if (!USA_UNIVERSIDAD.test(sql)) {
      throw new Error('La consulta no filtra por universidad ($1)')
    }
    return this.query<T>(sql, [universidadId, ...parametros])
  }

  // Un recurso de la universidad de la sesión. Responde 404 si no existe o es
  // de otra universidad: desde fuera no se distinguen.
  async obtenerEnUniversidad<T>(
    universidadId: string,
    sql: string,
    parametros: unknown[] = [],
  ): Promise<T> {
    const [fila] = await this.consultarEnUniversidad<T>(
      universidadId,
      sql,
      parametros,
    )
    if (!fila) {
      throw new NotFoundException()
    }
    return fila
  }

  async onModuleDestroy() {
    const bd = await this.conexion?.catch(() => undefined)
    if (bd?.isInitialized) {
      await bd.destroy()
    }
  }
}
