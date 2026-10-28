import { DataSource } from 'typeorm'
import { crearSuperadmin } from './crear-superadmin.js'
import { opcionesDataSource } from './data-source.js'

// Punto de entrada de npm run superadmin (MT-04). Las variables se leen del
// .env de la raíz (lo carga data-source.ts) o del entorno. En AWS, la
// contraseña llega como secreto (infra/aws/superadmin.sh). Nunca se imprime.
const correo = process.env.SUPERADMIN_CORREO
const nombre = process.env.SUPERADMIN_NOMBRE
const password = process.env.SUPERADMIN_PASSWORD
if (!correo || !nombre || !password) {
  console.error(
    'Faltan SUPERADMIN_CORREO, SUPERADMIN_NOMBRE o SUPERADMIN_PASSWORD (ver .env.example)',
  )
  process.exit(1)
}

const bd = await new DataSource(opcionesDataSource()).initialize()
try {
  if (await bd.showMigrations()) {
    throw new Error(
      'Hay migraciones pendientes: ejecuta npm run migration:run --workspace=backend',
    )
  }
  const superadmin = await crearSuperadmin(bd, { correo, nombre, password })
  console.log(
    `Superadmin creado: ${superadmin.correo}. Debe cambiar la contraseña provisoria en su primer ingreso.`,
  )
} catch (error) {
  // Solo el mensaje: el DETAIL de PostgreSQL puede incluir la fila completa,
  // con password_hash.
  console.error(
    `No se creó el superadmin: ${error instanceof Error ? error.message : String(error)}`,
  )
  process.exitCode = 1
} finally {
  await bd.destroy()
}
