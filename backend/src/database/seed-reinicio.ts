import type { EntityManager } from 'typeorm'

// Reinicio de una base de pruebas antes de cargar el seed (por ejemplo, para
// dejar staging limpio antes de una demo). Vacía todas las tablas de datos y
// conserva solo a los superadmins, que se crean con un comando aparte
// (crear-superadmin.ts) y no forman parte del seed.
//
// No es una función de la aplicación: la regla "nada académico se borra" vale
// para lo que hacen los usuarios, y este reinicio solo corre sobre una base de
// pruebas, con autorización explícita (verificarReinicio).

const TABLA_MIGRACIONES = 'migraciones'
const BASE_PRODUCCION = 'cursus_production'

export function verificarReinicio(env: NodeJS.ProcessEnv = process.env) {
  if (env.SEED_RESET !== 'true') {
    throw new Error('El reinicio de la base requiere SEED_RESET=true')
  }
  if (env.POSTGRES_DB === BASE_PRODUCCION) {
    throw new Error('El reinicio nunca corre sobre la base de producción')
  }
}

export interface ResumenReinicio {
  superadmins: number
}

// Corre dentro de la transacción del seed: si la carga posterior falla, el
// reinicio también se revierte y la base queda como estaba.
export async function reiniciarBase(
  m: EntityManager,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ResumenReinicio> {
  verificarReinicio(env)

  // Superadmins y su MFA, si lo activaron. Las sesiones no se conservan:
  // vuelven a entrar con su contraseña actual.
  await m.query(`
    CREATE TEMP TABLE reinicio_usuario ON COMMIT DROP AS
      SELECT * FROM usuario WHERE rol = 'SUPERADMIN'
  `)
  await m.query(`
    CREATE TEMP TABLE reinicio_mfa ON COMMIT DROP AS
      SELECT * FROM mfa_usuario
       WHERE usuario_id IN (SELECT id FROM reinicio_usuario)
  `)

  const [{ tablas }] = await m.query<{ tablas: string | null }[]>(
    `SELECT string_agg(format('%I.%I', schemaname, tablename), ', ' ORDER BY tablename) AS tablas
       FROM pg_tables
      WHERE schemaname = 'public' AND tablename <> $1`,
    [TABLA_MIGRACIONES],
  )
  if (tablas) {
    await m.query(`TRUNCATE ${tablas} CASCADE`)
  }

  await m.query('INSERT INTO usuario SELECT * FROM reinicio_usuario')
  await m.query('INSERT INTO mfa_usuario SELECT * FROM reinicio_mfa')
  const [{ total }] = await m.query<{ total: number }[]>(
    'SELECT count(*)::int AS total FROM reinicio_usuario',
  )
  return { superadmins: total }
}
