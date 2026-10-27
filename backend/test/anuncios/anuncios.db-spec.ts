import type { Anuncio } from '@cursus/shared'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { DataSource, QueryFailedError } from 'typeorm'
import { AppModule } from '../../src/app.module.js'
import type { RespuestaLogin } from '../../src/auth/auth.controller.js'
import { configurarApp } from '../../src/config/configurar-app.js'
import { ROL_APP } from '../../src/database/base-de-datos.service.js'
import { opcionesDataSource } from '../../src/database/data-source.js'
import { ejecutarSeed } from '../../src/database/seed.js'

// ANU-01: base propia con el seed cargado, que se crea y se borra en cada
// ejecución. Todos los usuarios del seed comparten la contraseña.
const BD_TEST = `${process.env.POSTGRES_TEST_DB ?? 'cursus_test'}_anuncios`
const PASSWORD = 'contraseña-de-prueba'
const BD_ORIGINAL = process.env.POSTGRES_DB

const PROFESOR = 'profesor@norte.cursus.test'
const AYUDANTE = 'ayudante@norte.cursus.test'
const ALUMNO = 'alumno@norte.cursus.test'
const ADMIN_INGENIERIA = 'administrativo.ingenieria@norte.cursus.test'
const ADMIN_ECONOMIA = 'administrativo.economia@norte.cursus.test'
const DIRECTOR = 'director@norte.cursus.test'
const PROFESOR_SUR = 'profesor@sur.cursus.test'

let admin: DataSource
let bd: DataSource
let app: INestApplication<App>
const tokens = new Map<string, string>()

// Usuarios de demo de Ingeniería Norte, distintos de los base.
const demo = { profesor2: '', ayudante2: '', alumno2: '', alumnoFuera: '' }
// ICC101 secciones 1 y 2 (mismo curso, profesores distintos) y la sección 1
// de ICC201 (otro curso, del mismo profesor que ICC101-1).
const secciones = { s1: '', s2: '', otroCurso: '' }

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
async function listar(correo: string, seccionId: string, estado = 200) {
  const token = await tokenDe(correo)
  const respuesta = await request(app.getHttpServer())
    .get(`/api/espacio/secciones/${seccionId}/anuncios`)
    .set('Authorization', `Bearer ${token}`)
    .expect(estado)
  return respuesta.body as Anuncio[]
}

async function publicar(
  correo: string,
  seccionId: string,
  body: object,
  estado = 201,
) {
  const token = await tokenDe(correo)
  const respuesta = await request(app.getHttpServer())
    .post(`/api/espacio/secciones/${seccionId}/anuncios`)
    .set('Authorization', `Bearer ${token}`)
    .send(body)
    .expect(estado)
  return respuesta.body as Anuncio & { message: string | string[] }
}

const idDe = async (correo: string) =>
  (
    await bd.query<{ id: string }[]>(
      'SELECT id FROM usuario WHERE correo = $1',
      [correo],
    )
  )[0].id

const seccionDe = async (codigo: string, numero: number) =>
  (
    await bd.query<{ id: string }[]>(
      `SELECT s.id FROM seccion s JOIN curso c ON c.id = s.curso_id
        WHERE c.codigo = $1 AND s.numero = $2`,
      [codigo, numero],
    )
  )[0].id

// Correo del n-ésimo usuario de demo de Ingeniería Norte con ese rol.
async function demoDe(rol: string, n: number) {
  const filas = await bd.query<{ correo: string }[]>(
    `SELECT u.correo FROM usuario u
       JOIN facultad f ON f.id = u.facultad_id
       JOIN universidad un ON un.id = u.universidad_id
      WHERE u.rol = $1 AND f.nombre = 'Facultad de Ingeniería'
        AND un.dominio_correo = 'norte.cursus.test'
        AND u.correo NOT IN ($2, $3, $4)
      ORDER BY u.correo`,
    [rol, PROFESOR, AYUDANTE, ALUMNO],
  )
  return filas[n].correo
}

const anunciosEnBase = async () =>
  Number(
    (
      await bd.query<{ cantidad: string }[]>(
        'SELECT count(*) AS cantidad FROM anuncio',
      )
    )[0].cantidad,
  )

// Escenario, armado como dueño de las tablas (sin RLS). Las asignaciones e
// inscripciones se agregan solo si no existen ya en el seed.
async function armarEscenario() {
  secciones.s1 = await seccionDe('ICC101', 1)
  secciones.s2 = await seccionDe('ICC101', 2)
  secciones.otroCurso = await seccionDe('ICC201', 1)
  demo.profesor2 = await demoDe('PROFESOR', 0)
  demo.ayudante2 = await demoDe('AYUDANTE', 0)
  demo.alumno2 = await demoDe('ALUMNO', 0)
  demo.alumnoFuera = await demoDe('ALUMNO', 1)

  const aCargo = async (seccionId: string, correo: string) =>
    bd.query<unknown>('UPDATE seccion SET profesor_id = $2 WHERE id = $1', [
      seccionId,
      await idDe(correo),
    ])
  await aCargo(secciones.s1, PROFESOR)
  await aCargo(secciones.s2, demo.profesor2)
  await aCargo(secciones.otroCurso, PROFESOR)

  const asignar = async (seccionId: string, correo: string) =>
    bd.query<unknown>(
      `INSERT INTO ayudante_seccion (universidad_id, seccion_id, usuario_id)
       SELECT s.universidad_id, s.id, $2 FROM seccion s
        WHERE s.id = $1 AND NOT EXISTS (
          SELECT 1 FROM ayudante_seccion a
           WHERE a.seccion_id = s.id AND a.usuario_id = $2 AND a.archived_at IS NULL)`,
      [seccionId, await idDe(correo)],
    )
  await asignar(secciones.s1, AYUDANTE)
  await asignar(secciones.s2, demo.ayudante2)

  // Las inscripciones de los alumnos de prueba en ICC101 se rehacen desde
  // cero: el seed puede haberlos inscrito en otras secciones del curso.
  const alumnos = [ALUMNO, demo.alumno2, demo.alumnoFuera]
  await bd.query(
    `UPDATE inscripcion i SET archived_at = now(), archivada_por = $2
      FROM seccion s, curso c, usuario u
     WHERE s.id = i.seccion_id AND c.id = s.curso_id AND c.codigo = 'ICC101'
       AND u.id = i.usuario_id AND u.correo = ANY($1) AND i.archived_at IS NULL`,
    [alumnos, await idDe(ADMIN_INGENIERIA)],
  )
  const inscribir = async (seccionId: string, correo: string) =>
    bd.query<unknown>(
      `INSERT INTO inscripcion (universidad_id, seccion_id, usuario_id)
       SELECT universidad_id, $1, $2 FROM seccion WHERE id = $1`,
      [seccionId, await idDe(correo)],
    )
  await inscribir(secciones.s1, ALUMNO)
  await inscribir(secciones.s2, demo.alumno2)
}

beforeAll(async () => {
  admin = await new DataSource(opcionesDataSource()).initialize()
  await admin.query(`DROP DATABASE IF EXISTS "${BD_TEST}" WITH (FORCE)`)
  await admin.query(`CREATE DATABASE "${BD_TEST}"`)
  bd = await new DataSource(opcionesDataSource(BD_TEST)).initialize()
  await bd.runMigrations()
  await ejecutarSeed(bd, PASSWORD)
  await armarEscenario()

  // La API se conecta a la base de este test.
  process.env.POSTGRES_DB = BD_TEST
  const modulo = await Test.createTestingModule({
    imports: [AppModule],
  }).compile()
  app = modulo.createNestApplication<INestApplication<App>>({ logger: false })
  configurarApp(app, { secretoOrigen: '' })
  await app.listen(0)
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

describe('ANU-01: anuncios para todo el curso', () => {
  let primero: Anuncio

  it('el profesor publica con título y cuerpo, y la respuesta trae autor y fecha', async () => {
    const antes = Date.now()
    primero = await publicar(PROFESOR, secciones.s1, {
      titulo: '  Cambio de sala  ',
      cuerpo: ' La clase del jueves es en la sala B-201. ',
    })

    expect(primero).toEqual({
      id: expect.any(String) as string,
      titulo: 'Cambio de sala',
      cuerpo: 'La clase del jueves es en la sala B-201.',
      autor: { id: await idDe(PROFESOR), nombre: 'Profesor Norte' },
      publicadoEn: expect.any(String) as string,
    })
    const publicado = Date.parse(primero.publicadoEn)
    expect(publicado).toBeGreaterThanOrEqual(antes - 5_000)
    expect(publicado).toBeLessThanOrEqual(Date.now() + 5_000)
  })

  it('lo ven los alumnos y ayudantes de todas las secciones del curso', async () => {
    for (const [correo, seccion] of [
      [ALUMNO, secciones.s1],
      [AYUDANTE, secciones.s1],
      [demo.alumno2, secciones.s2],
      [demo.ayudante2, secciones.s2],
      [demo.profesor2, secciones.s2],
    ]) {
      expect(await listar(correo, seccion)).toEqual([primero])
    }
  })

  it('el Director lo lee, en solo lectura', async () => {
    expect(await listar(DIRECTOR, secciones.s1)).toEqual([primero])
  })

  it('el cuerpo conserva sus saltos de línea y el título queda en una línea', async () => {
    const anuncio = await publicar(PROFESOR, secciones.s1, {
      titulo: 'Guía   de\n estudio',
      cuerpo: 'Temas:\n\t1. Grafos\n\t2. Árboles',
    })
    expect(anuncio.titulo).toBe('Guía de estudio')
    expect(anuncio.cuerpo).toBe('Temas:\n\t1. Grafos\n\t2. Árboles')
    await bd.query('UPDATE anuncio SET archived_at = now() WHERE id = $1', [
      anuncio.id,
    ])
  })

  it('otro profesor del curso también publica, y la lista va del más nuevo al más antiguo', async () => {
    const segundo = await publicar(demo.profesor2, secciones.s2, {
      titulo: 'Prueba 1',
      cuerpo: 'La prueba es el lunes.',
    })

    const lista = await listar(ALUMNO, secciones.s1)
    expect(lista.map((a) => a.id)).toEqual([segundo.id, primero.id])
    expect(lista[0].autor.id).toBe(await idDe(demo.profesor2))
  })

  it('no aparece en otro curso, aunque sea del mismo profesor', async () => {
    expect(await listar(PROFESOR, secciones.otroCurso)).toEqual([])
  })

  it('no incluye anuncios archivados', async () => {
    const archivado = await publicar(PROFESOR, secciones.s1, {
      titulo: 'Se archiva',
      cuerpo: 'No debe verse.',
    })
    await bd.query('UPDATE anuncio SET archived_at = now() WHERE id = $1', [
      archivado.id,
    ])
    const ids = (await listar(ALUMNO, secciones.s1)).map((a) => a.id)
    expect(ids).not.toContain(archivado.id)
  })

  describe('título y cuerpo son obligatorios', () => {
    it.each([
      ['sin título', { cuerpo: 'Cuerpo' }],
      ['con un título de solo espacios', { titulo: '   ', cuerpo: 'Cuerpo' }],
      ['sin cuerpo', { titulo: 'Título' }],
      ['con un cuerpo vacío', { titulo: 'Título', cuerpo: '' }],
      ['con un título de más de 200', { titulo: 'x'.repeat(201), cuerpo: 'C' }],
      [
        'con un cuerpo de más de 5000',
        { titulo: 'T', cuerpo: 'x'.repeat(5001) },
      ],
      ['con un campo extra', { titulo: 'T', cuerpo: 'C', cursoId: 'x' }],
      // PostgreSQL rechaza el NUL: sin la validación, respondería 500.
      ['con un NUL en el título', { titulo: 'T\u0000', cuerpo: 'C' }],
      ['con un NUL en el cuerpo', { titulo: 'T', cuerpo: 'C\u0000' }],
      ['con un título que no es texto', { titulo: 1, cuerpo: 'C' }],
    ])('responde 400 %s y no guarda nada', async (_caso, body) => {
      const antes = await anunciosEnBase()
      await publicar(PROFESOR, secciones.s1, body, 400)
      expect(await anunciosEnBase()).toBe(antes)
    })

    it('el mensaje dice qué falta', async () => {
      const respuesta = await publicar(
        PROFESOR,
        secciones.s1,
        { cuerpo: 'Cuerpo' },
        400,
      )
      expect(respuesta.message).toContain('Ingresa el título del anuncio')
    })
  })

  describe('quién no puede publicar', () => {
    it.each([
      ['un alumno', ALUMNO],
      ['un ayudante', AYUDANTE],
      ['el Administrativo', ADMIN_INGENIERIA],
      ['el Director', DIRECTOR],
    ])('%s recibe 403', async (_caso, correo) => {
      const antes = await anunciosEnBase()
      await publicar(correo, secciones.s1, { titulo: 'T', cuerpo: 'C' }, 403)
      expect(await anunciosEnBase()).toBe(antes)
    })

    it('un profesor que no es de esa sección recibe 403', async () => {
      // demo.profesor2 dicta ICC101-2, no ICC101-1.
      await publicar(
        demo.profesor2,
        secciones.s1,
        { titulo: 'T', cuerpo: 'C' },
        403,
      )
    })

    it('un profesor de otra universidad recibe 404', async () => {
      await publicar(
        PROFESOR_SUR,
        secciones.s1,
        { titulo: 'T', cuerpo: 'C' },
        404,
      )
    })
  })

  describe('quién no puede leer', () => {
    it('un alumno que no está inscrito en la sección recibe 403', async () => {
      await listar(demo.alumnoFuera, secciones.s1, 403)
    })

    it('el Administrativo recibe 403, aunque sea de la facultad del curso', async () => {
      await listar(ADMIN_INGENIERIA, secciones.s1, 403)
      await listar(ADMIN_ECONOMIA, secciones.s1, 403)
    })

    it('un usuario de otra universidad recibe 404', async () => {
      await listar(PROFESOR_SUR, secciones.s1, 404)
    })
  })

  it('si el profesor deja la sección, ya no publica desde ella', async () => {
    const [{ profesor }] = await bd.query<{ profesor: string }[]>(
      'SELECT profesor_id AS profesor FROM seccion WHERE id = $1',
      [secciones.s1],
    )
    await bd.query('UPDATE seccion SET profesor_id = NULL WHERE id = $1', [
      secciones.s1,
    ])
    try {
      await publicar(PROFESOR, secciones.s1, { titulo: 'T', cuerpo: 'C' }, 403)
    } finally {
      await bd.query('UPDATE seccion SET profesor_id = $2 WHERE id = $1', [
        secciones.s1,
        profesor,
      ])
    }
  })
})

describe('restricciones en la base de datos', () => {
  // Ejecuta la consulta con el rol de la API y la sesión dada (por defecto, la
  // universidad de Norte), dentro de una transacción que se revierte.
  async function comoApp(
    rol: string,
    sql: string,
    parametros: unknown[],
    dominio = 'norte.cursus.test',
  ) {
    const q = bd.createQueryRunner()
    await q.startTransaction()
    try {
      const [{ universidad }] = await q.query<{ universidad: string }[]>(
        'SELECT id AS universidad FROM universidad WHERE dominio_correo = $1',
        [dominio],
      )
      await q.query(`SET LOCAL ROLE ${ROL_APP}`)
      await q.query(
        `SELECT set_config('app.universidad_id', $1, true),
                set_config('app.rol', $2, true)`,
        [universidad, rol],
      )
      return await q.query<unknown>(sql, parametros)
    } finally {
      await q.rollbackTransaction()
      await q.release()
    }
  }

  const INSERTAR = `
    INSERT INTO anuncio (universidad_id, curso_id, autor_id, titulo, cuerpo)
    SELECT s.universidad_id, s.curso_id, $2, $3, $4 FROM seccion s WHERE s.id = $1`

  it('RLS: cada universidad lee solo sus anuncios, aunque la consulta no filtre', async () => {
    const enBase = await anunciosEnBase()
    expect(enBase).toBeGreaterThan(0)
    expect(await comoApp('ALUMNO', 'SELECT id FROM anuncio', [])).toHaveLength(
      enBase,
    )
    expect(
      await comoApp('ALUMNO', 'SELECT id FROM anuncio', [], 'sur.cursus.test'),
    ).toEqual([])
  })

  it('RLS: solo el rol PROFESOR inserta anuncios', async () => {
    const alumno = await idDe(ALUMNO)
    await expect(
      comoApp('ALUMNO', INSERTAR, [secciones.s1, alumno, 'T', 'C']),
    ).rejects.toMatchObject({ code: '42501' })
  })

  it('rechaza un autor de otra universidad aunque no pase por la API', async () => {
    const error: unknown = await bd
      .query<unknown>(INSERTAR, [
        secciones.s1,
        await idDe(PROFESOR_SUR),
        'T',
        'C',
      ])
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(QueryFailedError)
    expect((error as QueryFailedError).driverError).toMatchObject({
      code: '23503',
      constraint: 'fk_anuncio_autor',
    })
  })

  it.each([
    ['un título vacío', ' ', 'C', 'ck_anuncio_titulo'],
    ['un cuerpo vacío', 'T', '', 'ck_anuncio_cuerpo'],
  ])('rechaza %s', async (_caso, titulo, cuerpo, restriccion) => {
    const error: unknown = await bd
      .query<unknown>(INSERTAR, [
        secciones.s1,
        await idDe(PROFESOR),
        titulo,
        cuerpo,
      ])
      .catch((e: unknown) => e)
    expect((error as QueryFailedError).driverError).toMatchObject({
      code: '23514',
      constraint: restriccion,
    })
  })
})
