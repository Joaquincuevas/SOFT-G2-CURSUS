import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { DataSource, type DataSourceOptions } from 'typeorm'
import { EsquemaInicial1791923526004 } from './migrations/1791923526004-EsquemaInicial.js'

// El .env vive en la raíz del monorepo (ver .env.example). Si no existe, se
// usan las variables ya definidas en el entorno (por ejemplo, en el CI).
const archivoEnv = resolve(import.meta.dirname, '../../../.env')
if (existsSync(archivoEnv)) {
  process.loadEnvFile(archivoEnv)
}

export function opcionesDataSource(database?: string): DataSourceOptions {
  return {
    type: 'postgres',
    host: process.env.POSTGRES_HOST ?? 'localhost',
    port: Number(process.env.POSTGRES_PORT ?? 5432),
    username: process.env.POSTGRES_USER ?? 'cursus',
    password: process.env.POSTGRES_PASSWORD,
    database: database ?? process.env.POSTGRES_DB ?? 'cursus',
    migrations: [EsquemaInicial1791923526004],
    migrationsTableName: 'migraciones',
    migrationsTransactionMode: 'each',
    synchronize: false,
    // Sin logs de queries: los parámetros pueden incluir datos sensibles.
    logging: false,
  }
}

// Instancia que usa el CLI de TypeORM (scripts migration:* del backend).
export default new DataSource(opcionesDataSource())
