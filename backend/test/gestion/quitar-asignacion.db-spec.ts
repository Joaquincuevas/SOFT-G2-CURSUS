import type {
  AsignacionQuitada,
  AyudanteQuitado,
  CursoDetalle,
} from '@cursus/shared'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { DataSource, type QueryRunner } from 'typeorm'
import { AppModule } from '../../src/app.module.js'
import type { RespuestaLogin } from '../../src/auth/auth.controller.js'
import { configurarApp } from '../../src/config/configurar-app.js'
import { opcionesDataSource } from '../../src/database/data-source.js'
import { ejecutarSeed } from '../../src/database/seed.js'

// Base propia con el seed cargado, que se crea y se borra en cada ejecución
// (GES-14).
const BD_TEST = `${process.env.POSTGRES_TEST_DB ?? 'cursus_test'}_quitar_asignacion`
const PASSWORD = 'contraseña-de-prueba'
const BD_ORIGINAL = process.env.POSTGRES_DB
const SIN_PERMISO = '42501'

// Usuarios del seed.
const ADMIN = 'administrativo.ingenieria@norte.cursus.test'
const ADMIN_ECONOMIA = 'administrativo.economia@norte.cursus.test'
const ADMIN_SUR = 'administrativo@sur.cursus.test'
const DIRECTOR = 'director@norte.cursus.test'
const PROFESOR = 'profesor@norte.cursus.test'

let admin: DataSource
let bd: DataSource
let app: INestApplication<App>
const tokens = new Map<string, string>()

async function tokenDe(correo: string): Promise<string> {
  if (!tokens.has(correo)) {
    const respuesta = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ correo, password: PASSWORD })
      .expect(200)
    tokens.set(correo, (respuesta.body as RespuestaLogin).accessToken)
  }
  return tokens.get(correo) as string
}

// El token se pide antes de crear la petición: si no, supertest cierra el
// servidor de una petición al terminar la otra.
async function quitarProfesor(
  seccionId: string,
  cuerpo: object,
  estado = 200,
  correo = ADMIN,
) {
  const token = await tokenDe(correo)
  const respuesta = await request(app.getHttpServer())
    .patch(`/api/secciones/${seccionId}/profesor/quitar`)
    .set('Authorization', `Bearer ${token}`)
    .send(cuerpo)
    .expect(estado)
  return respuesta.body as AsignacionQuitada & { message: unknown }
}

async function quitarAyudante(
  seccionId: string,
  ayudanteId: string,
  cuerpo: object,
  estado = 200,
  correo = ADMIN,
) {
  const token = await tokenDe(correo)
  const respuesta = await request(app.getHttpServer())
    .patch(`/api/secciones/${seccionId}/ayudantes/${ayudanteId}/quitar`)
    .set('Authorization', `Bearer ${token}`)
    .send(cuerpo)
    .expect(estado)
  return respuesta.body as AyudanteQuitado & { message: unknown }
}

async function asignarAyudantes(seccionId: string, ayudanteIds: string[]) {
  const token = await tokenDe(ADMIN)
  await request(app.getHttpServer())
    .post(`/api/secciones/${seccionId}/ayudantes`)
    .set('Authorization', `Bearer ${token}`)
    .send({ ayudanteIds })
    .expect(200)
}

async function detalle(cursoId: string, correo = ADMIN) {
  const token = await tokenDe(correo)
  const respuesta = await request(app.getHttpServer())
    .get(`/api/cursos/${cursoId}`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200)
  return respuesta.body as CursoDetalle
}

// Sección del seed por código de curso y número.
const seccionDe = async (codigo: string, numero: number) =>
  (
    await bd.query<{ id: string; curso_id: string; universidad_id: string }[]>(
      `SELECT s.id, s.curso_id, s.universidad_id FROM seccion s
         JOIN curso c ON c.id = s.curso_id
        WHERE c.codigo = $1 AND s.numero = $2`,
      [codigo, numero],
    )
  )[0]

const idUsuario = async (correo: string) =>
  (
    await bd.query<{ id: string }[]>(
      'SELECT id FROM usuario WHERE correo = $1',
      [correo],
    )
  )[0].id

// Ayudantes de Norte del seed, en un orden fijo.
const ayudantesNorte = async () =>
  bd.query<{ id: string; nombre: string }[]>(
    `SELECT u.id, u.nombre FROM usuario u
       JOIN universidad un ON un.id = u.universidad_id
      WHERE un.dominio_correo = 'norte.cursus.test' AND u.rol = 'AYUDANTE'
        AND u.archived_at IS NULL
      ORDER BY u.nombre, u.id`,
  )

// Como dueño de las tablas, sin pasar por la API.
const asignarProfesorEnBase = (seccionId: string, profesorId: string) =>
  bd.query('UPDATE seccion SET profesor_id = $2 WHERE id = $1', [
    seccionId,
    profesorId,
  ])
const profesorDe = async (seccionId: string) =>
  (
    await bd.query<{ profesor_id: string | null }[]>(
      'SELECT profesor_id FROM seccion WHERE id = $1',
      [seccionId],
    )
  )[0].profesor_id
const historialDe = (seccionId: string) =>
  bd.query<
    {
      tipo: string
      anterior_id: string | null
      nuevo_id: string | null
      responsable_id: string
      motivo: string
      fecha: Date
    }[]
  >(
    `SELECT tipo, anterior_id, nuevo_id, responsable_id, motivo, fecha
       FROM asignacion_cambio WHERE seccion_id = $1 ORDER BY fecha, id`,
    [seccionId],
  )
const cantidadHistorial = async () =>
  (
    await bd.query<{ total: number }[]>(
      'SELECT count(*)::int AS total FROM asignacion_cambio',
    )
  )[0].total

beforeAll(async () => {
  admin = await new DataSource(opcionesDataSource()).initialize()
  await admin.query(`DROP DATABASE IF EXISTS "${BD_TEST}" WITH (FORCE)`)
  await admin.query(`CREATE DATABASE "${BD_TEST}"`)
  bd = await new DataSource(opcionesDataSource(BD_TEST)).initialize()
  await bd.runMigrations()
  await ejecutarSeed(bd, PASSWORD)

  // La API se conecta a la base de este test.
  process.env.POSTGRES_DB = BD_TEST
  const modulo = await Test.createTestingModule({
    imports: [AppModule],
  }).compile()
  app = modulo.createNestApplication<INestApplication<App>>({ logger: false })
  configurarApp(app, { secretoOrigen: '' })
  await app.listen(0, '127.0.0.1')
})

afterAll(async () => {
  await app?.close()
  process.env.POSTGRES_DB = BD_ORIGINAL
  await bd?.destroy()
  if (admin?.isInitialized) {
    await admin.query(`DROP DATABASE IF EXISTS "${BD_TEST}" WITH (FORCE)`)
    await admin.destroy()
  }
})

describe('PATCH /api/secciones/:id/profesor/quitar', () => {
  it('quita al profesor, la sección queda sin asignar y el cambio queda en el historial', async () => {
    const seccion = await seccionDe('ICC101', 1)
    const profesor = await idUsuario(PROFESOR)
    const responsable = await idUsuario(ADMIN)
    await asignarProfesorEnBase(seccion.id, profesor)

    const quitada = await quitarProfesor(seccion.id, {
      motivo: '  Asignación equivocada  ',
    })

    expect(quitada).toMatchObject({
      quitado: { id: profesor },
      quitadoPor: { id: responsable },
      motivo: 'Asignación equivocada',
    })
    expect(new Date(quitada.quitadoEn).getTime()).not.toBeNaN()
    expect(await profesorDe(seccion.id)).toBeNull()
    expect(await historialDe(seccion.id)).toEqual([
      {
        tipo: 'PROFESOR',
        anterior_id: profesor,
        nuevo_id: null,
        responsable_id: responsable,
        motivo: 'Asignación equivocada',
        fecha: new Date(quitada.quitadoEn),
      },
    ])
    // El detalle del curso (GES-08) la muestra sin profesor.
    const curso = await detalle(seccion.curso_id)
    expect(curso.secciones.find((s) => s.id === seccion.id)?.profesor).toBe(
      null,
    )
  })

  it('responde 404 si la sección no tiene profesor, sin registrar nada', async () => {
    const seccion = await seccionDe('ICC101', 2)
    await bd.query('UPDATE seccion SET profesor_id = NULL WHERE id = $1', [
      seccion.id,
    ])
    const antes = await cantidadHistorial()

    const respuesta = await quitarProfesor(seccion.id, { motivo: 'Error' }, 404)

    expect(respuesta.message).toBe('La sección no tiene profesor asignado')
    expect(await cantidadHistorial()).toBe(antes)
  })

  it.each([
    {},
    { motivo: '' },
    { motivo: '    ' },
    { motivo: 42 },
    { motivo: 'x'.repeat(501) },
    { motivo: 'Error', profesorId: '00000000-0000-4000-8000-000000000001' },
  ])('rechaza un body inválido %j sin cambiar nada', async (cuerpo) => {
    const seccion = await seccionDe('ICC201', 1)
    const profesor = await idUsuario(PROFESOR)
    await asignarProfesorEnBase(seccion.id, profesor)
    const antes = await cantidadHistorial()

    await quitarProfesor(seccion.id, cuerpo, 400)

    expect(await profesorDe(seccion.id)).toBe(profesor)
    expect(await cantidadHistorial()).toBe(antes)
  })

  it('acepta un motivo de 500 caracteres', async () => {
    const seccion = await seccionDe('ICC201', 1)
    await asignarProfesorEnBase(seccion.id, await idUsuario(PROFESOR))

    const quitada = await quitarProfesor(seccion.id, {
      motivo: 'x'.repeat(500),
    })

    expect(quitada.motivo).toHaveLength(500)
  })

  it.each([
    ['otra facultad', ADMIN_ECONOMIA],
    ['otra universidad', ADMIN_SUR],
  ])(
    'un administrativo de %s recibe 404 y la sección no cambia',
    async (_caso, correo) => {
      const seccion = await seccionDe('ICC201', 1)
      const profesor = await idUsuario(PROFESOR)
      await asignarProfesorEnBase(seccion.id, profesor)
      const antes = await cantidadHistorial()

      await quitarProfesor(seccion.id, { motivo: 'Error' }, 404, correo)

      expect(await profesorDe(seccion.id)).toBe(profesor)
      expect(await cantidadHistorial()).toBe(antes)
    },
  )

  it('responde 404 en una sección archivada', async () => {
    const seccion = await seccionDe('ICC201', 2)
    const profesor = await idUsuario(PROFESOR)
    await asignarProfesorEnBase(seccion.id, profesor)
    await bd.query('UPDATE seccion SET archived_at = now() WHERE id = $1', [
      seccion.id,
    ])
    try {
      await quitarProfesor(seccion.id, { motivo: 'Error' }, 404)
      expect(await profesorDe(seccion.id)).toBe(profesor)
    } finally {
      await bd.query('UPDATE seccion SET archived_at = NULL WHERE id = $1', [
        seccion.id,
      ])
    }
  })

  it('el Director recibe 403 y la sección no cambia', async () => {
    const seccion = await seccionDe('ICC201', 1)
    const profesor = await idUsuario(PROFESOR)
    await asignarProfesorEnBase(seccion.id, profesor)

    await quitarProfesor(seccion.id, { motivo: 'Error' }, 403, DIRECTOR)

    expect(await profesorDe(seccion.id)).toBe(profesor)
  })

  it('si no se puede registrar el historial, el profesor no se quita', async () => {
    const seccion = await seccionDe('ICC101', 2)
    const profesor = await idUsuario(PROFESOR)
    await asignarProfesorEnBase(seccion.id, profesor)
    await bd.query(
      'ALTER TABLE asignacion_cambio ADD CONSTRAINT ck_test_historial CHECK (false) NOT VALID',
    )
    try {
      await quitarProfesor(seccion.id, { motivo: 'Error' }, 500)
    } finally {
      await bd.query(
        'ALTER TABLE asignacion_cambio DROP CONSTRAINT ck_test_historial',
      )
    }
    expect(await profesorDe(seccion.id)).toBe(profesor)
  })
})

describe('PATCH /api/secciones/:id/ayudantes/:usuarioId/quitar', () => {
  it('quita solo a ese ayudante, devuelve los que quedan y registra el cambio', async () => {
    const seccion = await seccionDe('ICC101', 1)
    const [primero, segundo] = await ayudantesNorte()
    const responsable = await idUsuario(ADMIN)
    await asignarAyudantes(seccion.id, [primero.id, segundo.id])

    const quitada = await quitarAyudante(seccion.id, primero.id, {
      motivo: 'No corresponde a esta sección',
    })

    expect(quitada).toMatchObject({
      quitado: { id: primero.id, nombre: primero.nombre },
      quitadoPor: { id: responsable },
      motivo: 'No corresponde a esta sección',
    })
    expect(quitada.ayudantes.map((a) => a.id)).toEqual([segundo.id])
    const curso = await detalle(seccion.curso_id)
    expect(curso.secciones.find((s) => s.id === seccion.id)?.ayudantes).toEqual(
      [segundo.nombre],
    )
    expect(await historialDe(seccion.id)).toContainEqual(
      expect.objectContaining({
        tipo: 'AYUDANTE',
        anterior_id: primero.id,
        nuevo_id: null,
        responsable_id: responsable,
        motivo: 'No corresponde a esta sección',
      }),
    )
    // La asignación se archiva, no se borra.
    const filas = await bd.query<{ archived_at: Date | null }[]>(
      `SELECT archived_at FROM ayudante_seccion
        WHERE seccion_id = $1 AND usuario_id = $2`,
      [seccion.id, primero.id],
    )
    expect(filas).toHaveLength(1)
    expect(filas[0].archived_at).not.toBeNull()
  })

  it('un ayudante quitado se puede volver a asignar', async () => {
    const seccion = await seccionDe('ICC101', 1)
    const [primero] = await ayudantesNorte()

    await asignarAyudantes(seccion.id, [primero.id])

    const curso = await detalle(seccion.curso_id)
    expect(
      curso.secciones.find((s) => s.id === seccion.id)?.ayudantes,
    ).toContain(primero.nombre)
  })

  it('responde 404 si el ayudante no está asignado, sin registrar nada', async () => {
    const seccion = await seccionDe('ICC201', 2)
    const [primero] = await ayudantesNorte()
    const antes = await cantidadHistorial()

    const respuesta = await quitarAyudante(
      seccion.id,
      primero.id,
      { motivo: 'Error' },
      404,
    )

    expect(respuesta.message).toBe(
      'El ayudante no está asignado a esta sección',
    )
    expect(await cantidadHistorial()).toBe(antes)
  })

  it('un administrativo de otra universidad recibe 404 y no cambia nada', async () => {
    const seccion = await seccionDe('ICC201', 1)
    const [primero] = await ayudantesNorte()
    await asignarAyudantes(seccion.id, [primero.id])

    await quitarAyudante(
      seccion.id,
      primero.id,
      { motivo: 'Error' },
      404,
      ADMIN_SUR,
    )

    const curso = await detalle(seccion.curso_id)
    expect(
      curso.secciones.find((s) => s.id === seccion.id)?.ayudantes,
    ).toContain(primero.nombre)
  })

  it('exige motivo', async () => {
    const seccion = await seccionDe('ICC201', 1)
    const [primero] = await ayudantesNorte()

    await quitarAyudante(seccion.id, primero.id, { motivo: ' ' }, 400)
  })
})

describe('RLS del historial de asignaciones', () => {
  // Ejecuta la prueba con el rol de la API, dentro de una transacción que se
  // revierte al terminar.
  async function comoApp(
    sesion: { universidadId: string; rol: string },
    prueba: (q: QueryRunner) => Promise<void>,
  ) {
    const q = bd.createQueryRunner()
    await q.startTransaction()
    try {
      await q.query('SET LOCAL ROLE cursus_app')
      await q.query(
        `SELECT set_config('app.universidad_id', $1, true), set_config('app.rol', $2, true)`,
        [sesion.universidadId, sesion.rol],
      )
      await prueba(q)
    } finally {
      await q.rollbackTransaction()
      await q.release()
    }
  }

  const universidadDe = async (dominio: string) =>
    (
      await bd.query<{ id: string }[]>(
        'SELECT id FROM universidad WHERE dominio_correo = $1',
        [dominio],
      )
    )[0].id

  it('el administrativo lee las de su universidad y no las de otra', async () => {
    const norte = await universidadDe('norte.cursus.test')
    const sur = await universidadDe('sur.cursus.test')
    const total = await cantidadHistorial()
    expect(total).toBeGreaterThan(0)

    await comoApp(
      { universidadId: norte, rol: 'ADMINISTRATIVO' },
      async (q) => {
        const filas = await q.query<unknown[]>(
          'SELECT id FROM asignacion_cambio',
        )
        expect(filas).toHaveLength(total)
      },
    )
    await comoApp({ universidadId: sur, rol: 'ADMINISTRATIVO' }, async (q) => {
      expect(await q.query('SELECT id FROM asignacion_cambio')).toEqual([])
    })
  })

  it('el Director lee las de todas las universidades', async () => {
    const sur = await universidadDe('sur.cursus.test')
    await comoApp({ universidadId: sur, rol: 'DIRECTOR' }, async (q) => {
      const filas = await q.query<unknown[]>('SELECT id FROM asignacion_cambio')
      expect(filas).toHaveLength(await cantidadHistorial())
    })
  })

  it.each(['PROFESOR', 'AYUDANTE', 'ALUMNO'])(
    'el rol %s no lee el historial',
    async (rol) => {
      const norte = await universidadDe('norte.cursus.test')
      await comoApp({ universidadId: norte, rol }, async (q) => {
        expect(await q.query('SELECT id FROM asignacion_cambio')).toEqual([])
      })
    },
  )

  it.each([
    'UPDATE asignacion_cambio SET motivo = $1',
    'DELETE FROM asignacion_cambio',
  ])('es de solo adición: %s no se permite', async (sql) => {
    const norte = await universidadDe('norte.cursus.test')
    await comoApp(
      { universidadId: norte, rol: 'ADMINISTRATIVO' },
      async (q) => {
        await expect(
          q.query(sql, sql.includes('$1') ? ['cambiado'] : []),
        ).rejects.toMatchObject({ code: SIN_PERMISO })
      },
    )
  })

  it('el Director no puede insertar entradas', async () => {
    const norte = await universidadDe('norte.cursus.test')
    const seccion = await seccionDe('ICC101', 1)
    const director = await idUsuario(DIRECTOR)
    await comoApp({ universidadId: norte, rol: 'DIRECTOR' }, async (q) => {
      await expect(
        q.query(
          `INSERT INTO asignacion_cambio
             (universidad_id, seccion_id, tipo, anterior_id, responsable_id, motivo)
           VALUES ($1, $2, 'PROFESOR', $3, $3, 'Del director')`,
          [norte, seccion.id, director],
        ),
      ).rejects.toMatchObject({ code: SIN_PERMISO })
    })
  })
})

describe('restricciones de asignacion_cambio', () => {
  const insertar = async (datos: {
    tipo?: string
    anterior?: string | null
    nuevo?: string | null
    motivo?: string
  }) => {
    const seccion = await seccionDe('ICC101', 1)
    const responsable = await idUsuario(ADMIN)
    return bd.query<unknown[]>(
      `INSERT INTO asignacion_cambio
         (universidad_id, seccion_id, tipo, anterior_id, nuevo_id, responsable_id, motivo)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        seccion.universidad_id,
        seccion.id,
        datos.tipo ?? 'PROFESOR',
        datos.anterior === undefined ? responsable : datos.anterior,
        datos.nuevo ?? null,
        responsable,
        datos.motivo ?? 'Motivo',
      ],
    )
  }

  it.each([
    ['un tipo desconocido', { tipo: 'ALUMNO' }],
    ['un cambio sin personas', { anterior: null, nuevo: null }],
    ['un motivo vacío', { motivo: '   ' }],
    ['un motivo de más de 500 caracteres', { motivo: 'x'.repeat(501) }],
  ])('rechaza %s', async (_caso, datos) => {
    await expect(insertar(datos)).rejects.toMatchObject({ code: '23514' })
  })

  it('rechaza una persona de otra universidad', async () => {
    const deSur = await idUsuario('profesor@sur.cursus.test')
    await expect(insertar({ anterior: deSur })).rejects.toMatchObject({
      code: '23503',
    })
  })
})
