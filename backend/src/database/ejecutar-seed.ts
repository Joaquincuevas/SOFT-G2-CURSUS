import { DataSource } from 'typeorm'
import { opcionesDataSource } from './data-source.js'
import { hoyEnChile, resumenDemo, usuariosExtraDeDemo } from './seed-demo.js'
import { verificarReinicio } from './seed-reinicio.js'
import {
  ejecutarSeed,
  UNIVERSIDADES,
  usuariosDeDemo,
  verificarEntorno,
} from './seed.js'

// Punto de entrada de npm run seed. Las variables se leen del .env de la raíz
// (lo carga data-source.ts) o del entorno. Con SEED_RESET=true vacía antes la
// base, salvo los superadmins (seed-reinicio.ts).
const password = process.env.SEED_PASSWORD
if (!password) {
  console.error('Falta SEED_PASSWORD en .env (ver .env.example)')
  process.exit(1)
}

const reiniciar = process.env.SEED_RESET === 'true'
try {
  verificarEntorno()
  if (reiniciar) verificarReinicio()
} catch (error) {
  console.error((error as Error).message)
  process.exit(1)
}

const bd = await new DataSource(opcionesDataSource()).initialize()
try {
  const facultad = await ejecutarSeed(bd, password, process.env, {
    facultadCompleta: true,
    demo: { hoy: hoyEnChile() },
    reiniciar,
  })
  if (reiniciar) {
    const [{ total }] = await bd.query<{ total: number }[]>(
      `SELECT count(*)::int AS total FROM usuario WHERE rol = 'SUPERADMIN'`,
    )
    console.log(`Base reiniciada. Superadmins conservados: ${total}`)
  }
  const usuarios = UNIVERSIDADES.reduce((n, u) => n + u.usuarios.length, 0)
  const demo = UNIVERSIDADES.reduce(
    (n, u, i) =>
      n + usuariosDeDemo(i).length + usuariosExtraDeDemo(u.dominio).length,
    0,
  )
  console.log(
    `Seed listo: ${UNIVERSIDADES.length} universidades, ${usuarios} usuarios de prueba y ${demo} usuarios de demo`,
  )
  if (facultad) {
    console.log(
      `Ingeniería de Norte: ${facultad.carreras} carreras, ${facultad.cursos} cursos y ${facultad.secciones} secciones en el período activo`,
    )
  }
  const r = await resumenDemo(bd)
  console.log(
    `Demo: ${r.periodosCerrados} períodos cerrados, ${r.secciones} secciones, ${r.evaluaciones} evaluaciones, ${r.notas} notas, ${r.clases} clases y ${r.anuncios} anuncios`,
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
