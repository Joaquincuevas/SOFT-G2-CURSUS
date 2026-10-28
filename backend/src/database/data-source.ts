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
import { CodigoCursoUnicoNormalizado1792460000000 } from './migrations/1792460000000-CodigoCursoUnicoNormalizado.js'
import { CrearInscripcion1792470000000 } from './migrations/1792470000000-CrearInscripcion.js'
import { CrearHistorialCurso1792480000000 } from './migrations/1792480000000-CrearHistorialCurso.js'
import { CrearAyudanteSeccion1792490000000 } from './migrations/1792490000000-CrearAyudanteSeccion.js'
import { AsignarProfesorSeccion1792495000000 } from './migrations/1792495000000-AsignarProfesorSeccion.js'
import { ArchivarInscripcionConResponsable1792500000000 } from './migrations/1792500000000-ArchivarInscripcionConResponsable.js'
import { CrearHorarioSeccion1792510000000 } from './migrations/1792510000000-CrearHorarioSeccion.js'
import { CrearAsignacionCambio1792520000000 } from './migrations/1792520000000-CrearAsignacionCambio.js'
import { AgregarCredencialProvisoria1792530000000 } from './migrations/1792530000000-AgregarCredencialProvisoria.js'
import { CrearClase1792550000000 } from './migrations/1792550000000-CrearClase.js'
import { CrearEvaluacion1792540000000 } from './migrations/1792540000000-CrearEvaluacion.js'
import { CrearAnuncio1792560000000 } from './migrations/1792560000000-CrearAnuncio.js'
import { CrearNotaCambio1792570000000 } from './migrations/1792570000000-CrearNotaCambio.js'
import { CrearAsistencia1792580000000 } from './migrations/1792580000000-CrearAsistencia.js'
import { DirigirAnuncioSeccion1792600000000 } from './migrations/1792600000000-DirigirAnuncioSeccion.js'
import { CrearActividad1792610000000 } from './migrations/1792610000000-CrearActividad.js'
import { CrearLecturaAnuncio1792620000000 } from './migrations/1792620000000-CrearLecturaAnuncio.js'
import { AgregarRolSuperadmin1792650000000 } from './migrations/1792650000000-AgregarRolSuperadmin.js'
import { PermitirUsuarioSuperadmin1792651000000 } from './migrations/1792651000000-PermitirUsuarioSuperadmin.js'
import { ElegirFacultadSuperadmin1792652000000 } from './migrations/1792652000000-ElegirFacultadSuperadmin.js'
import { CrearSuperadminCambio1792653000000 } from './migrations/1792653000000-CrearSuperadminCambio.js'
import { CrearNota1792660000000 } from './migrations/1792660000000-CrearNota.js'

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
      CodigoCursoUnicoNormalizado1792460000000,
      CrearInscripcion1792470000000,
      CrearHistorialCurso1792480000000,
      CrearAyudanteSeccion1792490000000,
      AsignarProfesorSeccion1792495000000,
      ArchivarInscripcionConResponsable1792500000000,
      CrearHorarioSeccion1792510000000,
      CrearAsignacionCambio1792520000000,
      AgregarCredencialProvisoria1792530000000,
      CrearEvaluacion1792540000000,
      CrearClase1792550000000,
      CrearAnuncio1792560000000,
      CrearNotaCambio1792570000000,
      CrearAsistencia1792580000000,
      DirigirAnuncioSeccion1792600000000,
      CrearActividad1792610000000,
      CrearLecturaAnuncio1792620000000,
      AgregarRolSuperadmin1792650000000,
      PermitirUsuarioSuperadmin1792651000000,
      ElegirFacultadSuperadmin1792652000000,
      CrearSuperadminCambio1792653000000,
      CrearNota1792660000000,
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
