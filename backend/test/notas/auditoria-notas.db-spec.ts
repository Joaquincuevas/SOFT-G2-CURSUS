import type { Rol } from '@cursus/shared'
import { DataSource, type QueryRunner } from 'typeorm'
import {
  BaseDeDatos,
  type ContextoUniversidad,
  ROL_APP,
} from '../../src/database/base-de-datos.service.js'
import { opcionesDataSource } from '../../src/database/data-source.js'
import { ejecutarSeed } from '../../src/database/seed.js'
import {
  AuditoriaNotasService,
  type EventoNota,
} from '../../src/notas/auditoria-notas.service.js'

// NOT-04: base propia con el seed cargado, que se crea y se borra en cada
// ejecución. Sin endpoints: se prueba el servicio con la conexión real de la
// API (cursus_app, con RLS) y la tabla directamente.
const BD_TEST = `${process.env.POSTGRES_TEST_DB ?? 'cursus_test'}_auditoria_notas`
const BD_ORIGINAL = process.env.POSTGRES_DB

// Códigos de error de PostgreSQL.
const CHECK = '23514'
const FOREIGN_KEY = '23503'
const SIN_PERMISO = '42501'

let admin: DataSource
let bd: DataSource
let base: BaseDeDatos
const auditoria = new AuditoriaNotasService()

const ids = {
  norte: '',
  sur: '',
  evaluacion: '',
  profesor: '',
  ayudante: '',
  alumno: '',
  alumnoSur: '',
}

const idDe = async (correo: string) =>
  (
    await bd.query<{ id: string }[]>(
      'SELECT id FROM usuario WHERE correo = $1',
      [correo],
    )
  )[0].id

const universidadDe = async (dominio: string) =>
  (
    await bd.query<{ id: string }[]>(
      'SELECT id FROM universidad WHERE dominio_correo = $1',
      [dominio],
    )
  )[0].id

const contexto = (
  rol: Rol,
  universidadId = ids.norte,
): ContextoUniversidad => ({
  universidadId,
  rol,
})

// Registra el evento como lo hará NOT-05 y siguientes: dentro de una
// transacción de la API.
const registrar = (rol: Rol, evento: Partial<EventoNota>) =>
  base.enTransaccionEnUniversidad(contexto(rol), (tx) =>
    auditoria.registrar(tx, {
      universidadId: ids.norte,
      evaluacionId: ids.evaluacion,
      usuarioId: rol === 'AYUDANTE' ? ids.ayudante : ids.profesor,
      tipo: 'ENVIO',
      ...evento,
    }),
  )

const eventoDe = async (id: string) =>
  (
    await bd.query<
      {
        tipo: string
        alumno_id: string | null
        nota_anterior: string | null
        nota_nueva: string | null
        motivo: string | null
        usuario_id: string
        universidad_id: string
      }[]
    >(
      `SELECT tipo, alumno_id, nota_anterior, nota_nueva, motivo, usuario_id,
              universidad_id
         FROM nota_cambio WHERE id = $1`,
      [id],
    )
  )[0]

const cantidad = async () =>
  Number(
    (
      await bd.query<{ n: string }[]>('SELECT count(*) AS n FROM nota_cambio')
    )[0].n,
  )

// Inserta como dueño de la tabla (sin RLS ni la regla de registrar()), para
// probar los CHECK de la base.
const insertarDirecto = (columnas: Record<string, unknown>) => {
  const fila = {
    universidad_id: ids.norte,
    evaluacion_id: ids.evaluacion,
    usuario_id: ids.profesor,
    ...columnas,
  }
  const nombres = Object.keys(fila)
  return bd.query(
    `INSERT INTO nota_cambio (${nombres.join(', ')})
     VALUES (${nombres.map((_, i) => `$${i + 1}`).join(', ')})`,
    Object.values(fila),
  )
}

// Consulta con el rol de la API, en una transacción que se revierte.
async function comoApp(
  sesion: ContextoUniversidad,
  prueba: (q: QueryRunner) => Promise<void>,
) {
  const q = bd.createQueryRunner()
  await q.startTransaction()
  try {
    await q.query(`SET LOCAL ROLE ${ROL_APP}`)
    await q.query(
      `SELECT set_config('app.universidad_id', $1, true),
              set_config('app.rol', $2, true)`,
      [sesion.universidadId, sesion.rol],
    )
    await prueba(q)
  } finally {
    await q.rollbackTransaction()
    await q.release()
  }
}

beforeAll(async () => {
  admin = await new DataSource(opcionesDataSource()).initialize()
  await admin.query(`DROP DATABASE IF EXISTS "${BD_TEST}" WITH (FORCE)`)
  await admin.query(`CREATE DATABASE "${BD_TEST}"`)
  bd = await new DataSource(opcionesDataSource(BD_TEST)).initialize()
  await bd.runMigrations()
  await ejecutarSeed(bd, 'contraseña-de-prueba')

  ids.norte = await universidadDe('norte.cursus.test')
  ids.sur = await universidadDe('sur.cursus.test')
  ids.profesor = await idDe('profesor@norte.cursus.test')
  ids.ayudante = await idDe('ayudante@norte.cursus.test')
  ids.alumno = await idDe('alumno@norte.cursus.test')
  ids.alumnoSur = await idDe('alumno@sur.cursus.test')
  const [{ id }] = await bd.query<{ id: string }[]>(
    `INSERT INTO evaluacion (universidad_id, seccion_id, nombre, fecha, ponderacion, creada_por)
     SELECT s.universidad_id, s.id, 'Control 1', p.fecha_inicio, 20, $1
       FROM seccion s JOIN curso c ON c.id = s.curso_id
       JOIN periodo p ON p.id = c.periodo_id
      WHERE c.codigo = 'ICC101' AND s.numero = 1
     RETURNING id`,
    [ids.profesor],
  )
  ids.evaluacion = id

  // La API (BaseDeDatos) se conecta a la base de este test.
  process.env.POSTGRES_DB = BD_TEST
  base = new BaseDeDatos()
})

afterAll(async () => {
  await base?.onModuleDestroy()
  process.env.POSTGRES_DB = BD_ORIGINAL
  await bd?.destroy()
  if (admin?.isInitialized) {
    await admin.query(`DROP DATABASE IF EXISTS "${BD_TEST}" WITH (FORCE)`)
    await admin.destroy()
  }
})

describe('AuditoriaNotasService.registrar (NOT-04)', () => {
  it('PROPUESTA: la nota de un alumno, con su nota anterior (nula la primera vez)', async () => {
    const id = await registrar('AYUDANTE', {
      tipo: 'PROPUESTA',
      alumnoId: ids.alumno,
      notaNueva: 5.5,
    })

    expect(await eventoDe(id as string)).toEqual({
      tipo: 'PROPUESTA',
      alumno_id: ids.alumno,
      nota_anterior: null,
      nota_nueva: '5.5',
      motivo: null,
      usuario_id: ids.ayudante,
      universidad_id: ids.norte,
    })
  })

  it.each([
    ['ENVIO', 'AYUDANTE', undefined],
    ['APROBACION', 'PROFESOR', undefined],
    ['DEVOLUCION', 'PROFESOR', 'Revisa la pregunta 3'],
  ] as const)(
    '%s: un evento de toda la evaluación, sin alumno ni notas',
    async (tipo, rol, motivo) => {
      const id = await registrar(rol, { tipo, motivo })

      expect(await eventoDe(id as string)).toMatchObject({
        tipo,
        alumno_id: null,
        nota_anterior: null,
        nota_nueva: null,
        motivo: motivo ?? null,
      })
    },
  )

  it('RECORRECCION: nota anterior, nueva y motivo', async () => {
    const id = await registrar('PROFESOR', {
      tipo: 'RECORRECCION',
      alumnoId: ids.alumno,
      notaAnterior: 5.5,
      notaNueva: 6.1,
      motivo: 'Error de suma',
    })

    expect(await eventoDe(id as string)).toMatchObject({
      tipo: 'RECORRECCION',
      alumno_id: ids.alumno,
      nota_anterior: '5.5',
      nota_nueva: '6.1',
      motivo: 'Error de suma',
      usuario_id: ids.profesor,
    })
  })

  it('una PROPUESTA con la misma nota (borrador guardado de nuevo) no registra nada', async () => {
    const antes = await cantidad()

    expect(
      await registrar('AYUDANTE', {
        tipo: 'PROPUESTA',
        alumnoId: ids.alumno,
        notaAnterior: 5.5,
        notaNueva: 5.5,
      }),
    ).toBeNull()
    expect(await cantidad()).toBe(antes)

    // Si la nota cambia, sí.
    expect(
      await registrar('AYUDANTE', {
        tipo: 'PROPUESTA',
        alumnoId: ids.alumno,
        notaAnterior: 5.5,
        notaNueva: 5.8,
      }),
    ).toEqual(expect.any(String))
    expect(await cantidad()).toBe(antes + 1)
  })

  it('dentro de una transacción que se revierte, el evento no queda', async () => {
    const antes = await cantidad()

    await expect(
      base.enTransaccionEnUniversidad(contexto('PROFESOR'), async (tx) => {
        await auditoria.registrar(tx, {
          universidadId: ids.norte,
          evaluacionId: ids.evaluacion,
          tipo: 'APROBACION',
          usuarioId: ids.profesor,
        })
        // Falla lo que viene después (por ejemplo, guardar la nota).
        throw new Error('falla la nota')
      }),
    ).rejects.toThrow('falla la nota')

    expect(await cantidad()).toBe(antes)
  })
})

describe('restricciones de nota_cambio (NOT-04)', () => {
  it.each([
    [
      'una nota sobre 7,0',
      { tipo: 'PROPUESTA', alumno_id: 'alumno', nota_nueva: 7.1 },
    ],
    [
      'una nota bajo 1,0',
      { tipo: 'PROPUESTA', alumno_id: 'alumno', nota_nueva: 0.9 },
    ],
    [
      'una nota anterior fuera de rango',
      {
        tipo: 'RECORRECCION',
        alumno_id: 'alumno',
        nota_anterior: 0,
        nota_nueva: 5,
        motivo: 'x',
      },
    ],
    ['un tipo fuera de la lista', { tipo: 'BORRADO' }],
    ['DEVOLUCION sin motivo', { tipo: 'DEVOLUCION' }],
    [
      'RECORRECCION sin motivo',
      {
        tipo: 'RECORRECCION',
        alumno_id: 'alumno',
        nota_anterior: 4,
        nota_nueva: 5,
      },
    ],
    ['un motivo de solo espacios', { tipo: 'DEVOLUCION', motivo: '   ' }],
    ['PROPUESTA sin alumno', { tipo: 'PROPUESTA', nota_nueva: 5 }],
    ['PROPUESTA sin nota nueva', { tipo: 'PROPUESTA', alumno_id: 'alumno' }],
    [
      'PROPUESTA con la misma nota anterior y nueva',
      {
        tipo: 'PROPUESTA',
        alumno_id: 'alumno',
        nota_anterior: 5,
        nota_nueva: 5,
      },
    ],
    [
      'RECORRECCION sin nota anterior',
      { tipo: 'RECORRECCION', alumno_id: 'alumno', nota_nueva: 5, motivo: 'x' },
    ],
    ['ENVIO con alumno', { tipo: 'ENVIO', alumno_id: 'alumno' }],
    ['APROBACION con nota', { tipo: 'APROBACION', nota_nueva: 5 }],
  ])('rechaza %s (CHECK)', async (_caso, columnas) => {
    const fila = { ...columnas } as Record<string, unknown>
    if (fila.alumno_id === 'alumno') fila.alumno_id = ids.alumno
    await expect(insertarDirecto(fila)).rejects.toMatchObject({
      driverError: { code: CHECK },
    })
  })

  it('rechaza un alumno de otra universidad (FK compuesta)', async () => {
    await expect(
      insertarDirecto({
        tipo: 'PROPUESTA',
        alumno_id: ids.alumnoSur,
        nota_nueva: 5,
      }),
    ).rejects.toMatchObject({ driverError: { code: FOREIGN_KEY } })
  })
})

describe('solo adición (NOT-04)', () => {
  it.each(['UPDATE', 'DELETE'])(
    'cursus_app no tiene %s sobre nota_cambio',
    async (privilegio) => {
      const [{ puede }] = await bd.query<{ puede: boolean }[]>(
        `SELECT has_table_privilege($1, 'nota_cambio', $2) AS puede`,
        [ROL_APP, privilegio],
      )
      expect(puede).toBe(false)
    },
  )

  it.each([
    ['UPDATE', `UPDATE nota_cambio SET motivo = 'cambiado'`],
    ['DELETE', 'DELETE FROM nota_cambio'],
  ])('la API no puede hacer %s (permiso)', async (_caso, sql) => {
    await comoApp(contexto('PROFESOR'), async (q) => {
      await expect(q.query(sql)).rejects.toMatchObject({
        driverError: { code: SIN_PERMISO },
      })
    })
  })

  it.each([
    ['UPDATE', `UPDATE nota_cambio SET motivo = 'cambiado'`],
    ['DELETE', 'DELETE FROM nota_cambio'],
  ])(
    'ni el dueño de la tabla puede hacer %s (trigger)',
    async (operacion, sql) => {
      expect(await cantidad()).toBeGreaterThan(0)
      await expect(bd.query(sql)).rejects.toMatchObject({
        driverError: {
          code: SIN_PERMISO,
          message: `nota_cambio es de solo adición: no se puede ${operacion}`,
        },
      })
    },
  )
})

describe('RLS de nota_cambio (NOT-04)', () => {
  it('desde otra universidad no se ven los eventos de Norte', async () => {
    expect(await cantidad()).toBeGreaterThan(0)
    await comoApp(contexto('PROFESOR', ids.sur), async (q) => {
      expect(await q.query('SELECT id FROM nota_cambio')).toEqual([])
    })
  })

  it('el Director los lee en cualquier universidad', async () => {
    await comoApp(contexto('DIRECTOR', ids.sur), async (q) => {
      const filas = await q.query<{ id: string }[]>(
        'SELECT id FROM nota_cambio',
      )
      expect(filas.length).toBe(await cantidad())
    })
  })

  it('no se puede registrar en otra universidad ni con otro rol', async () => {
    for (const [rol, universidadId] of [
      ['PROFESOR', ids.sur],
      ['ALUMNO', ids.norte],
      ['ADMINISTRATIVO', ids.norte],
      ['DIRECTOR', ids.norte],
    ] as [Rol, string][]) {
      await expect(
        base.enTransaccionEnUniversidad({ universidadId, rol }, (tx) =>
          auditoria.registrar(tx, {
            universidadId: ids.norte,
            evaluacionId: ids.evaluacion,
            tipo: 'ENVIO',
            usuarioId: ids.profesor,
          }),
        ),
      ).rejects.toMatchObject({ driverError: { code: SIN_PERMISO } })
    }
  })
})
