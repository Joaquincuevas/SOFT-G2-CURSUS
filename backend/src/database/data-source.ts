import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { DataSource } from 'typeorm'
import type { PostgresDataSourceOptions } from 'typeorm/driver/postgres/PostgresDataSourceOptions.js'
import { VARIABLES_BASE_DE_DATOS, validarEntorno } from '../config/entorno.js'
import { EsquemaInicial1791923526004 } from './migrations/1791923526004-EsquemaInicial.js'
import { CrearRefreshToken1792428000000 } from './migrations/1792428000000-CrearRefreshToken.js'
import { CrearSesionAuth1792430000000 } from './migrations/1792430000000-CrearSesionAuth.js'
import { CrearIntentosLogin1792436000000 } from './migrations/1792436000000-CrearIntentosLogin.js'
import { AmpliarLimiteLoginIp1792440000000 } from './migrations/1792440000000-AmpliarLimiteLoginIp.js'
import { AgregarArchivado1792441000000 } from './migrations/1792441000000-AgregarArchivado.js'
import { ActivarRls1792441100000 } from './migrations/1792441100000-ActivarRls.js'
import { PermitirLecturaDirector1792442000000 } from './migrations/1792442000000-PermitirLecturaDirector.js'
import { CrearCurso1792443000000 } from './migrations/1792443000000-CrearCurso.js'
import { NombreCarreraUnicoNormalizado1792450000000 } from './migrations/1792450000000-NombreCarreraUnicoNormalizado.js'
import { CrearSeccion1792451000000 } from './migrations/1792451000000-CrearSeccion.js'

// El .env vive en la raíz del monorepo (ver .env.example). Si no existe, se
// usan las variables ya definidas en el entorno (por ejemplo, en el CI).
const archivoEnv = resolve(import.meta.dirname, '../../../.env')
if (existsSync(archivoEnv)) {
  process.loadEnvFile(archivoEnv)
}
// También cubre las migraciones, que usan esta conexión sin pasar por main.ts.
validarEntorno(VARIABLES_BASE_DE_DATOS)

export function opcionesDataSource(
  database?: string,
): PostgresDataSourceOptions {
  return {
    type: 'postgres',
    host: process.env.POSTGRES_HOST ?? 'localhost',
    port: Number(process.env.POSTGRES_PORT ?? 5432),
    username: process.env.POSTGRES_USER ?? 'cursus',
    password: process.env.POSTGRES_PASSWORD,
    database: database ?? process.env.POSTGRES_DB ?? 'cursus',
    // RDS exige SSL; el certificado se valida contra las CA del sistema y las
    // de NODE_EXTRA_CA_CERTS (la imagen Docker incluye las de RDS).
    ssl: process.env.POSTGRES_SSL === 'true',
    migrations: [
      EsquemaInicial1791923526004,
      CrearRefreshToken1792428000000,
      CrearSesionAuth1792430000000,
      CrearIntentosLogin1792436000000,
      AmpliarLimiteLoginIp1792440000000,
      AgregarArchivado1792441000000,
      ActivarRls1792441100000,
      PermitirLecturaDirector1792442000000,
      CrearCurso1792443000000,
      NombreCarreraUnicoNormalizado1792450000000,
      CrearSeccion1792451000000,
    ],
    migrationsTableName: 'migraciones',
    migrationsTransactionMode: 'each',
    synchronize: false,
    // Sin logs de queries: los parámetros pueden incluir datos sensibles.
    logging: false,
  }
}

// Instancia que usa el CLI de TypeORM (scripts migration:* del backend).
export default new DataSource(opcionesDataSource())
