import type { Rol } from '@cursus/shared'
import {
  ForbiddenException,
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

// Universidad y rol de la sesión (@UniversidadActual()), que las consultas
// institucionales fijan en la base para RLS.
export interface ContextoUniversidad {
  universidadId: string
  rol: Rol
}

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
  // - En la base (RLS): corre con ROL_APP, con la universidad y el rol fijados
  //   en app.universidad_id y app.rol. SET LOCAL y set_config(..., true) duran
  //   solo la transacción, así que no pasan a otra consulta que use la misma
  //   conexión.
  async consultarEnUniversidad<T>(
    contexto: ContextoUniversidad,
    sql: string,
    parametros: unknown[] = [],
  ): Promise<T[]> {
    if (!contexto.universidadId || !contexto.rol) {
      throw new Error('Falta la universidad de la sesión')
    }
    if (!USA_UNIVERSIDAD.test(sql)) {
      throw new Error('La consulta no filtra por universidad ($1)')
    }
    return this.enTransaccion(async (bd) => {
      await bd.query(`SET LOCAL ROLE ${ROL_APP}`)
      await bd.query(
        `SELECT set_config('app.universidad_id', $1, true),
                set_config('app.rol', $2, true)`,
        [contexto.universidadId, contexto.rol],
      )
      return bd.query<T>(sql, [contexto.universidadId, ...parametros])
    })
  }

  // Lectura de todas las universidades, solo para el Director (ADR 0001): la
  // vista consolidada del directorio. No exige $1 porque no filtra por
  // universidad. Responde 403 a cualquier otro rol, y corre en una transacción
  // READ ONLY: aunque la consulta intente escribir, la base la rechaza.
  async consultarEnTodasLasUniversidades<T>(
    contexto: ContextoUniversidad,
    sql: string,
    parametros: unknown[] = [],
  ): Promise<T[]> {
    if (contexto.rol !== 'DIRECTOR') {
      throw new ForbiddenException()
    }
    return this.enTransaccion(async (bd) => {
      // Debe ir antes que cualquier otra consulta de la transacción.
      await bd.query('SET TRANSACTION READ ONLY')
      await bd.query(`SET LOCAL ROLE ${ROL_APP}`)
      await bd.query(`SELECT set_config('app.rol', $1, true)`, [contexto.rol])
      return bd.query<T>(sql, parametros)
    })
  }

  // Un recurso de la universidad de la sesión. Responde 404 si no existe o es
  // de otra universidad: desde fuera no se distinguen.
  async obtenerEnUniversidad<T>(
    contexto: ContextoUniversidad,
    sql: string,
    parametros: unknown[] = [],
  ): Promise<T> {
    const [fila] = await this.consultarEnUniversidad<T>(
      contexto,
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
