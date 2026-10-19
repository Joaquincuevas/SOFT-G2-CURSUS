import {
  Injectable,
  NotFoundException,
  type OnModuleDestroy,
} from '@nestjs/common'
import { DataSource } from 'typeorm'
import { opcionesDataSource } from './data-source.js'

// $1 como parámetro completo: no confunde $10 o $11 con $1.
const USA_UNIVERSIDAD = /\$1(?!\d)/

// Rol de base de datos de las consultas institucionales, creado por la
// migración ActivarRls. No es dueño de las tablas, así que RLS se le aplica.
export const ROL_APP = 'cursus_app'

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
  // de la sesión (@UniversidadActual()) en dos capas:
  // - En la consulta: por convención, $1 es siempre la universidad y los demás
  //   parámetros siguen desde $2. Falla si la consulta no usa $1, para que no
  //   se pueda olvidar el filtro.
  // - En la base (RLS): corre con ROL_APP y la universidad fijada en
  //   app.universidad_id. SET LOCAL y set_config(..., true) duran solo la
  //   transacción, así que no pasan a otra consulta que use la misma conexión.
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
    return this.enTransaccion(async (bd) => {
      await bd.query(`SET LOCAL ROLE ${ROL_APP}`)
      await bd.query(`SELECT set_config('app.universidad_id', $1, true)`, [
        universidadId,
      ])
      return bd.query<T>(sql, [universidadId, ...parametros])
    })
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
