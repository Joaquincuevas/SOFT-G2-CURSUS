import { verify } from 'argon2'
import { DataSource } from 'typeorm'
import { opcionesDataSource } from '../../src/database/data-source.js'
import {
  ejecutarSeed,
  PERIODO,
  type Rol,
  UNIVERSIDADES,
} from '../../src/database/seed.js'

// Base propia, distinta de la de esquema-inicial.db-spec.ts, que se crea y se
// borra en cada ejecución.
const BD_TEST = `${process.env.POSTGRES_TEST_DB ?? 'cursus_test'}_seed`
const PASSWORD = 'contraseña-de-prueba'
const ROLES: Rol[] = [
  'DIRECTOR',
  'ADMINISTRATIVO',
  'PROFESOR',
  'AYUDANTE',
  'ALUMNO',
]
const TOTAL_USUARIOS = UNIVERSIDADES.reduce((n, u) => n + u.usuarios.length, 0)

let admin: DataSource
let bd: DataSource

async function conteos() {
  const tablas = [
    'universidad',
    'facultad',
    'carrera',
    'periodo',
    'usuario',
    'curso',
  ]
  const filas = await Promise.all(
    tablas.map(async (tabla) => {
      const [{ total }] = await bd.query<{ total: string }[]>(
        `SELECT count(*) AS total FROM ${tabla}`,
      )
      return [tabla, Number(total)] as const
    }),
  )
  return Object.fromEntries(filas)
}

function usuariosDe(dominio: string) {
  return bd.query<{ rol: Rol; correo: string; facultad: string | null }[]>(
    `SELECT us.rol, us.correo, f.nombre AS facultad FROM usuario us
     JOIN universidad un ON un.id = us.universidad_id
     LEFT JOIN facultad f ON f.id = us.facultad_id
     WHERE un.dominio_correo = $1`,
    [dominio],
  )
}

beforeAll(async () => {
  admin = await new DataSource(opcionesDataSource()).initialize()
  await admin.query(`DROP DATABASE IF EXISTS "${BD_TEST}" WITH (FORCE)`)
  await admin.query(`CREATE DATABASE "${BD_TEST}"`)
  bd = await new DataSource(opcionesDataSource(BD_TEST)).initialize()
})

afterAll(async () => {
  await bd?.destroy()
  if (admin?.isInitialized) {
    await admin.query(`DROP DATABASE IF EXISTS "${BD_TEST}" WITH (FORCE)`)
    await admin.destroy()
  }
})

describe('seed de datos simulados', () => {
  it('se niega a correr con migraciones pendientes', async () => {
    await expect(ejecutarSeed(bd, PASSWORD)).rejects.toThrow(
      /migraciones pendientes/,
    )
  })

  it('se niega a correr en producción sin SEED_ALLOW', async () => {
    await bd.runMigrations()
    await expect(
      ejecutarSeed(bd, PASSWORD, { NODE_ENV: 'production' }),
    ).rejects.toThrow(/SEED_ALLOW=true/)
    expect((await conteos()).universidad).toBe(0)
  })

  it('crea las universidades con sus facultades, carreras y período activo', async () => {
    await ejecutarSeed(bd, PASSWORD)

    for (const u of UNIVERSIDADES) {
      const facultades = await bd.query<
        { facultad: string; carrera: string }[]
      >(
        `SELECT f.nombre AS facultad, c.nombre AS carrera FROM facultad f
         JOIN universidad un ON un.id = f.universidad_id
         JOIN carrera c ON c.facultad_id = f.id
         WHERE un.dominio_correo = $1 ORDER BY f.nombre`,
        [u.dominio],
      )
      expect(facultades).toEqual(
        u.facultades
          .map((f) => ({ facultad: f.nombre, carrera: f.carrera }))
          .sort((a, b) => a.facultad.localeCompare(b.facultad)),
      )

      const [{ activos }] = await bd.query<{ activos: string }[]>(
        `SELECT count(*) AS activos FROM periodo p
         JOIN universidad un ON un.id = p.universidad_id
         WHERE un.dominio_correo = $1 AND p.activo`,
        [u.dominio],
      )
      expect(Number(activos)).toBe(1)
    }

    // Escenario del cliente: una universidad con varias facultades.
    expect(UNIVERSIDADES[0].facultades.length).toBeGreaterThanOrEqual(2)
  })

  it('crea los cursos de cada carrera en el período activo', async () => {
    for (const u of UNIVERSIDADES) {
      const cursos = await bd.query<{ codigo: string; carrera: string }[]>(
        `SELECT c.codigo, ca.nombre AS carrera FROM curso c
           JOIN carrera ca ON ca.id = c.carrera_id
           JOIN periodo p ON p.id = c.periodo_id
           JOIN universidad un ON un.id = c.universidad_id
          WHERE un.dominio_correo = $1 AND p.activo
          ORDER BY c.codigo`,
        [u.dominio],
      )
      expect(cursos).toEqual(
        u.facultades
          .flatMap((f) =>
            f.cursos.map((c) => ({ codigo: c.codigo, carrera: f.carrera })),
          )
          .sort((a, b) => a.codigo.localeCompare(b.codigo)),
      )
      // Al menos dos cursos por facultad, para la demo.
      for (const f of u.facultades) {
        expect(f.cursos.length).toBeGreaterThanOrEqual(2)
      }
    }
  })

  it('crea al menos un usuario de cada rol en cada universidad', async () => {
    for (const u of UNIVERSIDADES) {
      const usuarios = await usuariosDe(u.dominio)
      expect(new Set(usuarios.map((us) => us.rol))).toEqual(new Set(ROLES))
      expect(usuarios.map((us) => us.correo).sort()).toEqual(
        u.usuarios.map((us) => `${us.usuario}@${u.dominio}`).sort(),
      )
    }
  })

  it('asigna un administrativo a cada facultad y deja al director sin facultad', async () => {
    for (const u of UNIVERSIDADES) {
      const usuarios = await usuariosDe(u.dominio)
      const facultadesConAdministrativo = usuarios
        .filter((us) => us.rol === 'ADMINISTRATIVO')
        .map((us) => us.facultad)
        .sort()
      expect(facultadesConAdministrativo).toEqual(
        u.facultades.map((f) => f.nombre).sort(),
      )
      expect(usuarios.find((us) => us.rol === 'DIRECTOR')?.facultad).toBeNull()
    }
  })

  it('guarda la contraseña hasheada con argon2id', async () => {
    const usuarios = await bd.query<{ password_hash: string }[]>(
      'SELECT password_hash FROM usuario',
    )
    expect(usuarios).toHaveLength(TOTAL_USUARIOS)
    for (const { password_hash } of usuarios) {
      expect(password_hash).toMatch(/^\$argon2id\$/)
      expect(await verify(password_hash, PASSWORD)).toBe(true)
    }
  })

  it('no duplica datos al ejecutarse de nuevo', async () => {
    const antes = await conteos()
    await ejecutarSeed(bd, PASSWORD)
    expect(await conteos()).toEqual(antes)
  })

  it('no pisa un curso editado ni lo desarchiva al ejecutarse de nuevo', async () => {
    await bd.query(
      `UPDATE curso SET nombre = 'Nombre editado', archived_at = now()
        WHERE codigo = 'ICC101'`,
    )
    await ejecutarSeed(bd, PASSWORD)
    const [curso] = await bd.query<{ nombre: string; archivado: boolean }[]>(
      `SELECT nombre, archived_at IS NOT NULL AS archivado FROM curso
        WHERE codigo = 'ICC101'`,
    )
    expect(curso).toEqual({ nombre: 'Nombre editado', archivado: true })
  })

  it('no activa su período si la universidad ya tiene otro activo', async () => {
    const dominio = UNIVERSIDADES[0].dominio
    const [{ id }] = await bd.query<{ id: string }[]>(
      'SELECT id FROM universidad WHERE dominio_correo = $1',
      [dominio],
    )
    await bd.query(
      'UPDATE periodo SET activo = false WHERE universidad_id = $1',
      [id],
    )
    await bd.query(
      `INSERT INTO periodo (universidad_id, anio, semestre, fecha_inicio, fecha_termino, activo)
       VALUES ($1, 2027, 1, '2027-03-01', '2027-07-15', true)`,
      [id],
    )

    await ejecutarSeed(bd, PASSWORD)

    const periodos = await bd.query<
      { anio: number; semestre: number; activo: boolean }[]
    >(
      'SELECT anio, semestre, activo FROM periodo WHERE universidad_id = $1 ORDER BY anio',
      [id],
    )
    expect(periodos).toEqual([
      { anio: PERIODO.anio, semestre: PERIODO.semestre, activo: false },
      { anio: 2027, semestre: 1, activo: true },
    ])
  })
})
