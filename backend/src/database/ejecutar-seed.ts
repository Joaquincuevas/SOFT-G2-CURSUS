import { DataSource } from 'typeorm'
import { opcionesDataSource } from './data-source.js'
import { ejecutarSeed, ROLES, UNIVERSIDADES } from './seed.js'

// Punto de entrada de npm run seed. Las variables se leen del .env de la raíz
// (lo carga data-source.ts) o del entorno.
const password = process.env.SEED_PASSWORD
if (!password) {
  console.error('Falta SEED_PASSWORD en .env (ver .env.example)')
  process.exit(1)
}

const bd = await new DataSource(opcionesDataSource()).initialize()
try {
  await ejecutarSeed(bd, password)
  console.log(
    `Seed listo: ${UNIVERSIDADES.length} universidades con ${ROLES.length} usuarios de prueba cada una`,
  )
} catch (error) {
  // Solo el mensaje: el DETAIL de PostgreSQL puede incluir la fila completa,
  // con correo y password_hash.
  console.error(
    `El seed falló: ${error instanceof Error ? error.message : String(error)}`,
  )
  process.exitCode = 1
} finally {
  await bd.destroy()
}
