import { hash } from 'argon2'
import type { DataSource, EntityManager } from 'typeorm'

// Datos simulados para desarrollo y la primera validación con el cliente.
// Los dominios usan el TLD reservado .test, así que ningún correo es real.

type Rol = 'DIRECTOR' | 'ADMINISTRATIVO' | 'PROFESOR' | 'AYUDANTE' | 'ALUMNO'

interface UniversidadSeed {
  nombre: string
  dominio: string
  facultad: string
  carrera: string
  // Se agrega al nombre de cada usuario para distinguirlos entre universidades.
  sufijo: string
}

export const UNIVERSIDADES: UniversidadSeed[] = [
  {
    nombre: 'Universidad Demo Norte',
    dominio: 'norte.cursus.test',
    facultad: 'Facultad de Ingeniería',
    carrera: 'Ingeniería Civil en Informática',
    sufijo: 'Norte',
  },
  {
    nombre: 'Universidad Demo Sur',
    dominio: 'sur.cursus.test',
    facultad: 'Facultad de Ciencias',
    carrera: 'Licenciatura en Física',
    sufijo: 'Sur',
  },
]

export const PERIODO = {
  anio: 2026,
  semestre: 2,
  inicio: '2026-08-03',
  termino: '2026-12-18',
}

// El correo de cada usuario es <rol en minúsculas>@<dominio>.
export const ROLES: { rol: Rol; nombre: string }[] = [
  { rol: 'DIRECTOR', nombre: 'Director' },
  { rol: 'ADMINISTRATIVO', nombre: 'Administrativo' },
  { rol: 'PROFESOR', nombre: 'Profesor' },
  { rol: 'AYUDANTE', nombre: 'Ayudante' },
  { rol: 'ALUMNO', nombre: 'Alumno' },
]

export function correoDe(rol: Rol, dominio: string) {
  return `${rol.toLowerCase()}@${dominio}`
}

// Cada INSERT hace upsert sobre una clave única del schema, así que ejecutar
// el seed de nuevo actualiza las filas en vez de duplicarlas.
async function upsert(
  m: EntityManager,
  sql: string,
  parametros: unknown[],
): Promise<string> {
  const filas = await m.query<{ id: string }[]>(
    `${sql} RETURNING id`,
    parametros,
  )
  return filas[0].id
}

async function sembrarUniversidad(
  m: EntityManager,
  u: UniversidadSeed,
  passwordHash: string,
) {
  const universidadId = await upsert(
    m,
    `INSERT INTO universidad (nombre, dominio_correo) VALUES ($1, $2)
     ON CONFLICT (dominio_correo) DO UPDATE SET nombre = EXCLUDED.nombre`,
    [u.nombre, u.dominio],
  )

  const facultadId = await upsert(
    m,
    `INSERT INTO facultad (universidad_id, nombre) VALUES ($1, $2)
     ON CONFLICT (universidad_id, nombre) DO UPDATE SET nombre = EXCLUDED.nombre`,
    [universidadId, u.facultad],
  )

  await upsert(
    m,
    `INSERT INTO carrera (universidad_id, facultad_id, nombre) VALUES ($1, $2, $3)
     ON CONFLICT (facultad_id, nombre) DO UPDATE SET nombre = EXCLUDED.nombre`,
    [universidadId, facultadId, u.carrera],
  )

  await upsert(
    m,
    `INSERT INTO periodo (universidad_id, anio, semestre, fecha_inicio, fecha_termino, activo)
     VALUES ($1, $2, $3, $4, $5, true)
     ON CONFLICT (universidad_id, anio, semestre) DO UPDATE SET
       fecha_inicio = EXCLUDED.fecha_inicio,
       fecha_termino = EXCLUDED.fecha_termino,
       activo = EXCLUDED.activo`,
    [
      universidadId,
      PERIODO.anio,
      PERIODO.semestre,
      PERIODO.inicio,
      PERIODO.termino,
    ],
  )

  // El director no se asocia a una facultad; el resto sí (el administrativo
  // la requiere por schema).
  for (const { rol, nombre } of ROLES) {
    await upsert(
      m,
      `INSERT INTO usuario (universidad_id, facultad_id, nombre, correo, password_hash, rol)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (universidad_id, lower(correo)) DO UPDATE SET
         facultad_id = EXCLUDED.facultad_id,
         nombre = EXCLUDED.nombre,
         password_hash = EXCLUDED.password_hash,
         rol = EXCLUDED.rol`,
      [
        universidadId,
        rol === 'DIRECTOR' ? null : facultadId,
        `${nombre} ${u.sufijo}`,
        correoDe(rol, u.dominio),
        passwordHash,
        rol,
      ],
    )
  }
}

// Todos los usuarios de prueba comparten la contraseña, que viene de la
// variable SEED_PASSWORD y nunca del código. Se hashea con argon2id.
export async function ejecutarSeed(bd: DataSource, password: string) {
  if (await bd.showMigrations()) {
    throw new Error(
      'Hay migraciones pendientes: ejecuta npm run migration:run --workspace=backend',
    )
  }

  const passwordHash = await hash(password)
  await bd.transaction(async (m) => {
    for (const universidad of UNIVERSIDADES) {
      await sembrarUniversidad(m, universidad, passwordHash)
    }
  })
}
