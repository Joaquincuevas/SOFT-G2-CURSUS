import type { Rol } from '@cursus/shared'
import { DataSource, type QueryRunner } from 'typeorm'
import { ROL_APP } from '../../src/database/base-de-datos.service.js'
import { crearSuperadmin } from '../../src/database/crear-superadmin.js'
import { opcionesDataSource } from '../../src/database/data-source.js'
import { ejecutarSeed, UNIVERSIDADES } from '../../src/database/seed.js'

// MT-04 (ADR 0002): el superadmin en la base, sin pasar por la API. Lee las
// universidades y facultades de todas para elegir dónde trabajar; dentro de
// una facultad escribe como su Administrativo, y cada cambio queda auditado.
// La API no puede crear superadmins.

const BD_TEST = `${process.env.POSTGRES_TEST_DB ?? 'cursus_test'}_superadmin_rls`

// Códigos de error de PostgreSQL.
const SIN_PERMISO = '42501'
const CHECK = '23514'

let admin: DataSource
let bd: DataSource
let superadminId: string
const universidades: Record<string, string> = {}
// Una facultad de cada universidad.
const facultades: Record<string, string> = {}
const [NORTE, SUR] = UNIVERSIDADES.map((u) => u.dominio)

interface Sesion {
  universidadId?: string
  rol?: Rol
  superadminId?: string
  facultadId?: string
  motivo?: string
}

// Ejecuta la prueba con el rol de la API, en una transacción que se revierte
// al terminar. Fija solo lo que se le pasa, con los mismos nombres que
// BaseDeDatos.
async function comoApp(
  sesion: Sesion,
  prueba: (q: QueryRunner) => Promise<void>,
) {
  const q = bd.createQueryRunner()
  await q.startTransaction()
  try {
    await q.query(`SET LOCAL ROLE ${ROL_APP}`)
    const ajustes: [string, string | undefined][] = [
      ['app.universidad_id', sesion.universidadId],
      ['app.rol', sesion.rol],
      ['app.superadmin_id', sesion.superadminId],
      ['app.facultad_id', sesion.facultadId],
      ['app.motivo', sesion.motivo],
    ]
    for (const [nombre, valor] of ajustes) {
      if (valor) {
        await q.query(`SELECT set_config($1, $2, true)`, [nombre, valor])
      }
    }
    await prueba(q)
  } finally {
    await q.rollbackTransaction()
    await q.release()
  }
}

// El superadmin trabajando en una facultad de NORTE, como lo fija la API.
const superadminEnNorte = (motivo?: string): Sesion => ({
  universidadId: universidades[NORTE],
  rol: 'ADMINISTRATIVO',
  superadminId,
  facultadId: facultades[NORTE],
  motivo,
})

// Vuelve al dueño de las tablas dentro de la misma transacción, para leer lo
// que la API no ve (por ejemplo, la auditoría).
const comoDueno = (q: QueryRunner) => q.query('RESET ROLE')

// QueryRunner.query no es genérico: el tipo de las filas se declara aquí.
const filas = async <T>(
  q: Pick<QueryRunner, 'query'>,
  sql: string,
  parametros: unknown[] = [],
) => (await q.query(sql, parametros)) as T[]

const idDe = async (
  q: Pick<QueryRunner, 'query'>,
  sql: string,
  parametros: unknown[],
) => {
  const [fila] = await filas<{ id: string }>(q, sql, parametros)
  return fila.id
}

// Un usuario del seed de NORTE con ese rol, leído por el dueño de las tablas.
const usuarioDeNorte = (rol: Rol) =>
  idDe(
    bd,
    `SELECT id FROM usuario WHERE universidad_id = $1 AND rol = $2 LIMIT 1`,
    [universidades[NORTE], rol],
  )

beforeAll(async () => {
  admin = await new DataSource(opcionesDataSource()).initialize()
  await admin.query(`DROP DATABASE IF EXISTS "${BD_TEST}" WITH (FORCE)`)
  await admin.query(`CREATE DATABASE "${BD_TEST}"`)
  bd = await new DataSource(opcionesDataSource(BD_TEST)).initialize()
  await bd.runMigrations()
  await ejecutarSeed(bd, 'contraseña-de-prueba')
  ;({ id: superadminId } = await crearSuperadmin(bd, {
    correo: 'superadmin@cursus.test',
    nombre: 'Superadmin',
    password: 'contraseña-provisoria',
  }))

  for (const { dominio } of UNIVERSIDADES) {
    const [{ id, facultad }] = await bd.query<
      { id: string; facultad: string }[]
    >(
      `SELECT un.id, f.id AS facultad FROM universidad un
         JOIN facultad f ON f.universidad_id = un.id
        WHERE un.dominio_correo = $1 ORDER BY f.nombre LIMIT 1`,
      [dominio],
    )
    universidades[dominio] = id
    facultades[dominio] = facultad
  }
})

afterAll(async () => {
  await bd?.destroy()
  if (admin?.isInitialized) {
    await admin.query(`DROP DATABASE IF EXISTS "${BD_TEST}" WITH (FORCE)`)
    await admin.destroy()
  }
})

describe('lectura para elegir dónde trabajar', () => {
  it.each(['universidad', 'facultad'])(
    '%s: lee las filas de todas las universidades',
    async (tabla) => {
      const todas = await bd.query<{ id: string }[]>(
        `SELECT id FROM ${tabla} ORDER BY id`,
      )
      await comoApp({ rol: 'SUPERADMIN' }, async (q) => {
        expect(await q.query(`SELECT id FROM ${tabla} ORDER BY id`)).toEqual(
          todas,
        )
      })
    },
  )

  it.each(['carrera', 'periodo', 'usuario', 'curso', 'seccion'])(
    '%s: sin una universidad fijada no ve filas',
    async (tabla) => {
      await comoApp({ rol: 'SUPERADMIN' }, async (q) => {
        expect(await q.query(`SELECT id FROM ${tabla}`)).toEqual([])
      })
    },
  )

  it('no crea facultades con su rol propio (GES-23 lo agrega)', async () => {
    await comoApp({ rol: 'SUPERADMIN' }, async (q) => {
      await expect(
        q.query(
          `INSERT INTO facultad (universidad_id, nombre) VALUES ($1, 'Nueva')`,
          [universidades[NORTE]],
        ),
      ).rejects.toMatchObject({ code: SIN_PERMISO })
    })
  })
})

describe('solo un comando crea superadmins', () => {
  const administrativo = (): Sesion => ({
    universidadId: universidades[NORTE],
    rol: 'ADMINISTRATIVO',
  })

  it('la API no puede insertar un superadmin', async () => {
    await comoApp(administrativo(), async (q) => {
      await expect(
        q.query(
          `INSERT INTO usuario (universidad_id, nombre, correo, password_hash, rol)
           VALUES (NULL, 'Intruso', 'intruso@cursus.test', $1, 'SUPERADMIN')`,
          ['$argon2id$v=19$m=65536,t=3,p=4$aaaaaaaaaaaaaaaaaaaaaa'],
        ),
      ).rejects.toMatchObject({ code: SIN_PERMISO })
    })
  })

  it('la API no puede convertir a un usuario en superadmin', async () => {
    const alumno = await usuarioDeNorte('ALUMNO')
    await comoApp(administrativo(), async (q) => {
      // Sin universidad (ni facultad), la fila sale de la política.
      await expect(
        q.query(
          `UPDATE usuario
              SET rol = 'SUPERADMIN', universidad_id = NULL, facultad_id = NULL
            WHERE id = $1`,
          [alumno],
        ),
      ).rejects.toMatchObject({ code: SIN_PERMISO })
    })
    await comoApp(administrativo(), async (q) => {
      // Con universidad, lo frena el CHECK.
      await expect(
        q.query(`UPDATE usuario SET rol = 'SUPERADMIN' WHERE id = $1`, [
          alumno,
        ]),
      ).rejects.toMatchObject({ code: CHECK })
    })
  })

  it.each(['DIRECTOR', 'ADMINISTRATIVO', 'PROFESOR', 'ALUMNO'] as const)(
    'el rol %s no ve la fila del superadmin',
    async (rol) => {
      await comoApp({ universidadId: universidades[NORTE], rol }, async (q) => {
        expect(
          await q.query(`SELECT id FROM usuario WHERE rol = 'SUPERADMIN'`),
        ).toEqual([])
      })
    },
  )
})

describe('facultad_actual()', () => {
  const facultadActual = async (q: QueryRunner, usuarioId: string) => {
    const [{ facultad }] = await filas<{ facultad: string | null }>(
      q,
      'SELECT facultad_actual($1) AS facultad',
      [usuarioId],
    )
    return facultad
  }

  it('del Administrativo es su facultad', async () => {
    const [administrativo] = await bd.query<
      { id: string; facultad_id: string }[]
    >(
      `SELECT id, facultad_id FROM usuario
        WHERE universidad_id = $1 AND rol = 'ADMINISTRATIVO' LIMIT 1`,
      [universidades[NORTE]],
    )
    await comoApp(
      { universidadId: universidades[NORTE], rol: 'ADMINISTRATIVO' },
      async (q) => {
        expect(await facultadActual(q, administrativo.id)).toBe(
          administrativo.facultad_id,
        )
      },
    )
  })

  it('del superadmin es la que eligió', async () => {
    await comoApp(superadminEnNorte(), async (q) => {
      expect(await facultadActual(q, superadminId)).toBe(facultades[NORTE])
    })
  })

  it('del superadmin es NULL si la facultad es de otra universidad', async () => {
    await comoApp(
      { ...superadminEnNorte(), facultadId: facultades[SUR] },
      async (q) => {
        expect(await facultadActual(q, superadminId)).toBeNull()
      },
    )
  })

  it('de un profesor es NULL', async () => {
    const profesor = await usuarioDeNorte('PROFESOR')
    await comoApp(
      { universidadId: universidades[NORTE], rol: 'PROFESOR' },
      async (q) => {
        expect(await facultadActual(q, profesor)).toBeNull()
      },
    )
  })
})

describe('auditoría (superadmin_cambio)', () => {
  const crearCarrera = (q: QueryRunner, nombre: string) =>
    idDe(
      q,
      `INSERT INTO carrera (universidad_id, facultad_id, nombre)
       VALUES ($1, $2, $3) RETURNING id`,
      [universidades[NORTE], facultades[NORTE], nombre],
    )

  const cambiosDe = (q: QueryRunner, registroId: string) =>
    filas<{
      universidad_id: string
      superadmin_id: string
      tabla: string
      operacion: string
      anterior: Record<string, unknown> | null
      nuevo: Record<string, unknown>
      motivo: string | null
    }>(
      q,
      `SELECT universidad_id, superadmin_id, tabla, operacion, anterior, nuevo,
              motivo
         FROM superadmin_cambio WHERE registro_id = $1 ORDER BY fecha, id`,
      [registroId],
    )

  it('registra lo que crea, con el valor nuevo', async () => {
    await comoApp(superadminEnNorte(), async (q) => {
      const carrera = await crearCarrera(q, 'Carrera del superadmin')
      await comoDueno(q)
      expect(await cambiosDe(q, carrera)).toEqual([
        {
          universidad_id: universidades[NORTE],
          superadmin_id: superadminId,
          tabla: 'carrera',
          operacion: 'INSERT',
          anterior: null,
          nuevo: expect.objectContaining({
            id: carrera,
            nombre: 'Carrera del superadmin',
          }) as unknown,
          motivo: null,
        },
      ])
    })
  })

  it('registra el valor anterior, el nuevo y el motivo al modificar', async () => {
    await comoApp(superadminEnNorte('Corrige el nombre'), async (q) => {
      const carrera = await crearCarrera(q, 'Nombre con error')
      await q.query(
        `UPDATE carrera SET nombre = 'Nombre correcto' WHERE id = $1`,
        [carrera],
      )
      await comoDueno(q)
      const [, modificacion] = await cambiosDe(q, carrera)
      expect(modificacion).toMatchObject({
        operacion: 'UPDATE',
        anterior: { nombre: 'Nombre con error' },
        nuevo: { nombre: 'Nombre correcto' },
        motivo: 'Corrige el nombre',
      })
    })
  })

  it('no guarda password_hash', async () => {
    const alumno = await usuarioDeNorte('ALUMNO')
    await comoApp(superadminEnNorte(), async (q) => {
      await q.query(`UPDATE usuario SET nombre = 'Otro nombre' WHERE id = $1`, [
        alumno,
      ])
      await comoDueno(q)
      const [cambio] = await cambiosDe(q, alumno)
      expect(cambio.nuevo).toMatchObject({ nombre: 'Otro nombre' })
      expect(cambio.anterior).not.toHaveProperty('password_hash')
      expect(cambio.nuevo).not.toHaveProperty('password_hash')
    })
  })

  it('un UPDATE que no cambia nada no deja registro', async () => {
    await comoApp(superadminEnNorte(), async (q) => {
      const carrera = await crearCarrera(q, 'Sin cambios')
      await q.query(`UPDATE carrera SET nombre = nombre WHERE id = $1`, [
        carrera,
      ])
      await comoDueno(q)
      expect(await cambiosDe(q, carrera)).toHaveLength(1)
    })
  })

  it('no registra los cambios de otros roles', async () => {
    await comoApp(
      { universidadId: universidades[NORTE], rol: 'ADMINISTRATIVO' },
      async (q) => {
        const carrera = await crearCarrera(q, 'Del Administrativo')
        await comoDueno(q)
        expect(await cambiosDe(q, carrera)).toEqual([])
      },
    )
  })

  it('solo la lee un superadmin', async () => {
    await comoApp(superadminEnNorte(), async (q) => {
      await crearCarrera(q, 'Para leer')
      // Como Administrativo (el rol con que escribe) no la ve.
      expect(await q.query('SELECT id FROM superadmin_cambio')).toEqual([])
      await q.query(`SELECT set_config('app.rol', 'SUPERADMIN', true)`)
      expect(await q.query('SELECT id FROM superadmin_cambio')).toHaveLength(1)
    })
  })

  it.each([
    [
      'insertar',
      `INSERT INTO superadmin_cambio
         (universidad_id, superadmin_id, tabla, registro_id, operacion, nuevo)
       SELECT universidad_id, superadmin_id, tabla, registro_id, operacion, nuevo
         FROM superadmin_cambio`,
    ],
    ['modificar', `UPDATE superadmin_cambio SET motivo = 'Otro'`],
    ['borrar', 'DELETE FROM superadmin_cambio'],
  ])('la API no puede %s registros', async (_accion, sql) => {
    await comoApp({ rol: 'SUPERADMIN' }, async (q) => {
      await expect(q.query(sql)).rejects.toMatchObject({ code: SIN_PERMISO })
    })
  })

  it('ni el dueño de las tablas modifica ni borra un registro', async () => {
    const q = bd.createQueryRunner()
    await q.startTransaction()
    try {
      await q.query(`SET LOCAL ROLE ${ROL_APP}`)
      for (const [nombre, valor] of Object.entries({
        'app.universidad_id': universidades[NORTE],
        'app.rol': 'ADMINISTRATIVO',
        'app.superadmin_id': superadminId,
        'app.facultad_id': facultades[NORTE],
      })) {
        await q.query(`SELECT set_config($1, $2, true)`, [nombre, valor])
      }
      await crearCarrera(q, 'Inmutable')
      await comoDueno(q)
      for (const sql of [
        `UPDATE superadmin_cambio SET motivo = 'Otro'`,
        'DELETE FROM superadmin_cambio',
      ]) {
        await q.query('SAVEPOINT intento')
        await expect(q.query(sql)).rejects.toMatchObject({ code: SIN_PERMISO })
        await q.query('ROLLBACK TO SAVEPOINT intento')
      }
    } finally {
      await q.rollbackTransaction()
      await q.release()
    }
  })
})
