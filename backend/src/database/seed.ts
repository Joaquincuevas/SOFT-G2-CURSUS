import { hash } from 'argon2'
import type { DataSource, EntityManager } from 'typeorm'

// Datos simulados para desarrollo y la primera validación con el cliente. Imitan
// su escenario: una universidad grande con varias facultades y otra pequeña de
// ciencias de la salud. Los dominios usan el TLD reservado .test, así que
// ningún correo es real.

export type Rol =
  'DIRECTOR' | 'ADMINISTRATIVO' | 'PROFESOR' | 'AYUDANTE' | 'ALUMNO'

interface CursoSeed {
  codigo: string
  nombre: string
}

interface FacultadSeed {
  nombre: string
  carrera: string
  // Cursos de la carrera, en el período activo de la universidad.
  cursos: CursoSeed[]
}

interface UsuarioSeed {
  rol: Rol
  nombre: string
  // Parte del correo antes de @; el dominio es el de su universidad.
  usuario: string
  // Nombre de una facultad de la misma universidad. El director no tiene.
  facultad?: string
}

interface UniversidadSeed {
  nombre: string
  dominio: string
  facultades: FacultadSeed[]
  usuarios: UsuarioSeed[]
}

const INGENIERIA = 'Facultad de Ingeniería'
const ECONOMIA = 'Facultad de Economía y Negocios'
const SALUD = 'Facultad de Ciencias de la Salud'

export const UNIVERSIDADES: UniversidadSeed[] = [
  {
    nombre: 'Universidad Demo Norte',
    dominio: 'norte.cursus.test',
    facultades: [
      {
        nombre: INGENIERIA,
        carrera: 'Ingeniería Civil en Informática',
        cursos: [
          { codigo: 'ICC101', nombre: 'Introducción a la Programación' },
          { codigo: 'ICC201', nombre: 'Estructuras de Datos' },
        ],
      },
      {
        nombre: ECONOMIA,
        carrera: 'Ingeniería Comercial',
        cursos: [
          { codigo: 'ICO101', nombre: 'Introducción a la Economía' },
          { codigo: 'ICO201', nombre: 'Contabilidad' },
        ],
      },
    ],
    // Un administrativo por facultad, para probar el aislamiento entre ellas.
    usuarios: [
      { rol: 'DIRECTOR', nombre: 'Director Norte', usuario: 'director' },
      {
        rol: 'ADMINISTRATIVO',
        nombre: 'Administrativo Ingeniería Norte',
        usuario: 'administrativo.ingenieria',
        facultad: INGENIERIA,
      },
      {
        rol: 'ADMINISTRATIVO',
        nombre: 'Administrativo Economía Norte',
        usuario: 'administrativo.economia',
        facultad: ECONOMIA,
      },
      {
        rol: 'PROFESOR',
        nombre: 'Profesor Norte',
        usuario: 'profesor',
        facultad: INGENIERIA,
      },
      {
        rol: 'AYUDANTE',
        nombre: 'Ayudante Norte',
        usuario: 'ayudante',
        facultad: INGENIERIA,
      },
      {
        rol: 'ALUMNO',
        nombre: 'Alumno Norte',
        usuario: 'alumno',
        facultad: INGENIERIA,
      },
    ],
  },
  {
    nombre: 'Universidad Demo Sur',
    dominio: 'sur.cursus.test',
    facultades: [
      {
        nombre: SALUD,
        carrera: 'Enfermería',
        cursos: [
          { codigo: 'ENF101', nombre: 'Fundamentos de Enfermería' },
          { codigo: 'ENF201', nombre: 'Anatomía y Fisiología' },
        ],
      },
    ],
    usuarios: [
      { rol: 'DIRECTOR', nombre: 'Director Sur', usuario: 'director' },
      {
        rol: 'ADMINISTRATIVO',
        nombre: 'Administrativo Salud Sur',
        usuario: 'administrativo',
        facultad: SALUD,
      },
      {
        rol: 'PROFESOR',
        nombre: 'Profesor Sur',
        usuario: 'profesor',
        facultad: SALUD,
      },
      {
        rol: 'AYUDANTE',
        nombre: 'Ayudante Sur',
        usuario: 'ayudante',
        facultad: SALUD,
      },
      {
        rol: 'ALUMNO',
        nombre: 'Alumno Sur',
        usuario: 'alumno',
        facultad: SALUD,
      },
    ],
  },
]

export const PERIODO = {
  anio: 2026,
  semestre: 2,
  inicio: '2026-08-03',
  termino: '2026-12-18',
}

// El seed crea usuarios con una contraseña conocida, así que en producción solo
// corre si se autoriza de forma explícita (por ejemplo, para levantar staging).
export function verificarEntorno(env: NodeJS.ProcessEnv = process.env) {
  if (env.NODE_ENV === 'production' && env.SEED_ALLOW !== 'true') {
    throw new Error(
      'El seed no corre con NODE_ENV=production. Si es intencional (por ejemplo, en staging), define SEED_ALLOW=true',
    )
  }
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

  const facultadIds = new Map<string, string>()
  const carreraIds = new Map<FacultadSeed, string>()
  for (const facultad of u.facultades) {
    const facultadId = await upsert(
      m,
      `INSERT INTO facultad (universidad_id, nombre) VALUES ($1, $2)
       ON CONFLICT (universidad_id, nombre) DO UPDATE SET nombre = EXCLUDED.nombre`,
      [universidadId, facultad.nombre],
    )
    facultadIds.set(facultad.nombre, facultadId)

    const carreraId = await upsert(
      m,
      `INSERT INTO carrera (universidad_id, facultad_id, nombre) VALUES ($1, $2, $3)
       ON CONFLICT (facultad_id, nombre) DO UPDATE SET nombre = EXCLUDED.nombre`,
      [universidadId, facultadId, facultad.carrera],
    )
    carreraIds.set(facultad, carreraId)
  }

  // Solo puede haber un período activo por universidad: el del seed queda
  // activo únicamente si la universidad no tiene otro activo.
  await upsert(
    m,
    `INSERT INTO periodo (universidad_id, anio, semestre, fecha_inicio, fecha_termino, activo)
     VALUES ($1, $2, $3, $4, $5, NOT EXISTS (
       SELECT 1 FROM periodo
       WHERE universidad_id = $1 AND activo AND (anio, semestre) <> ($2, $3)
     ))
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

  // Los cursos van solo en el período activo, que puede no ser el del seed. Si
  // el código ya existe en ese período no se toca: ni su nombre ni su
  // archived_at, por si alguien lo editó o lo archivó (por ejemplo, en staging).
  for (const [facultad, carreraId] of carreraIds) {
    for (const curso of facultad.cursos) {
      await m.query(
        `INSERT INTO curso (universidad_id, carrera_id, periodo_id, codigo, nombre)
         SELECT $1, $2, p.id, $3, $4 FROM periodo p
          WHERE p.universidad_id = $1 AND p.activo
         ON CONFLICT (codigo, periodo_id) DO NOTHING`,
        [universidadId, carreraId, curso.codigo, curso.nombre],
      )
    }
  }

  for (const usuario of u.usuarios) {
    const facultadId = usuario.facultad
      ? facultadIds.get(usuario.facultad)
      : null
    if (facultadId === undefined) {
      throw new Error(
        `La facultad "${usuario.facultad}" de ${usuario.usuario}@${u.dominio} no existe en el seed`,
      )
    }

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
        facultadId,
        usuario.nombre,
        `${usuario.usuario}@${u.dominio}`,
        passwordHash,
        usuario.rol,
      ],
    )
  }
}

// Todos los usuarios de prueba comparten la contraseña, que viene de la
// variable SEED_PASSWORD y nunca del código. Se hashea con argon2id.
export async function ejecutarSeed(
  bd: DataSource,
  password: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  verificarEntorno(env)

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
