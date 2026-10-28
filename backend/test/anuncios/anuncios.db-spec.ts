import {
  MAX_ANUNCIOS_LECTURA,
  type Anuncio,
  type SeccionAlumno,
} from '@cursus/shared'
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
import { DirigirAnuncioSeccion1792600000000 } from '../../src/database/migrations/1792600000000-DirigirAnuncioSeccion.js'
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
      seccion: null,
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
      expect(await listar(correo, seccion)).toMatchObject([primero])
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

describe('ANU-02: anuncios para una sección', () => {
  let privado: Anuncio

  it('publica con la sección destinataria y su número', async () => {
    privado = await publicar(PROFESOR, secciones.s1, {
      titulo: 'Solo sección 1',
      cuerpo: 'Cambio de horario',
      seccionId: secciones.s1,
    })
    expect(privado.seccion).toEqual({ id: secciones.s1, numero: 1 })
    const [guardado] = await bd.query<{ seccion_id: string }[]>(
      'SELECT seccion_id FROM anuncio WHERE id = $1',
      [privado.id],
    )
    expect(guardado.seccion_id).toBe(secciones.s1)
  })

  it('lo reciben el profesor, ayudante y alumno de la sección', async () => {
    for (const correo of [PROFESOR, AYUDANTE, ALUMNO]) {
      expect(await listar(correo, secciones.s1)).toContainEqual(
        expect.objectContaining(privado),
      )
    }
  })

  it('acepta un UUID válido en mayúsculas para la misma sección', async () => {
    const anuncio = await publicar(PROFESOR, secciones.s1, {
      titulo: 'UUID normalizado',
      cuerpo: 'Para esta sección',
      seccionId: secciones.s1.toUpperCase(),
    })
    expect(anuncio.seccion).toEqual({ id: secciones.s1, numero: 1 })
    expect(await listar(demo.alumno2, secciones.s2)).not.toContainEqual(
      expect.objectContaining(anuncio),
    )
  })

  it('no filtra el título ni el cuerpo a otra sección del mismo curso', async () => {
    for (const correo of [demo.profesor2, demo.ayudante2, demo.alumno2]) {
      const lista = await listar(correo, secciones.s2)
      expect(
        lista.some((a) => a.id === privado.id || a.titulo === privado.titulo),
      ).toBe(false)
      expect(lista.length).toBeGreaterThan(0) // Los generales siguen visibles.
    }
    expect(await listar(PROFESOR, secciones.otroCurso)).toEqual([])
  })

  it('el Director sigue viendo los generales, pero no los de sección', async () => {
    const lista = await listar(DIRECTOR, secciones.s1)
    expect(lista.length).toBeGreaterThan(0)
    expect(lista.every((a) => a.seccion === null)).toBe(true)
  })

  it('null publica para todo el curso, conservando el contrato anterior', async () => {
    const general = await publicar(PROFESOR, secciones.s1, {
      titulo: 'General explícito',
      cuerpo: 'Para todos',
      seccionId: null,
    })
    expect(general.seccion).toBeNull()
    expect(await listar(demo.alumno2, secciones.s2)).toContainEqual(
      expect.objectContaining(general),
    )
  })

  it.each(['', 'no-es-uuid', 1, {}, []])(
    'rechaza un destinatario inválido: %j',
    async (seccionId) => {
      const antes = await anunciosEnBase()
      await publicar(
        PROFESOR,
        secciones.s1,
        { titulo: 'T', cuerpo: 'C', seccionId },
        400,
      )
      expect(await anunciosEnBase()).toBe(antes)
    },
  )

  it('rechaza otra sección, otro curso y un UUID inexistente sin guardar', async () => {
    for (const seccionId of [
      secciones.s2,
      secciones.otroCurso,
      '00000000-0000-4000-8000-000000000099',
    ]) {
      const antes = await anunciosEnBase()
      await publicar(
        PROFESOR,
        secciones.s1,
        { titulo: 'T', cuerpo: 'C', seccionId },
        400,
      )
      expect(await anunciosEnBase()).toBe(antes)
    }
  })

  it('una inscripción retirada pierde el acceso aunque el anuncio exista', async () => {
    const alumnoId = await idDe(ALUMNO)
    const retiradas = await bd.query<{ id: string }[]>(
      `WITH retiradas AS (
         UPDATE inscripcion SET archived_at = now(), archivada_por = $3
          WHERE seccion_id = $1 AND usuario_id = $2 AND archived_at IS NULL RETURNING id
       ) SELECT id FROM retiradas`,
      [secciones.s1, alumnoId, await idDe(ADMIN_INGENIERIA)],
    )
    try {
      await listar(ALUMNO, secciones.s1, 403)
    } finally {
      await bd.query(
        'UPDATE inscripcion SET archived_at = NULL, archivada_por = NULL WHERE id = ANY($1::uuid[])',
        [retiradas.map((i) => i.id)],
      )
    }
  })

  it('la FK rechaza una sección que no pertenece al curso del anuncio', async () => {
    await expect(
      bd.query('UPDATE anuncio SET seccion_id = $2 WHERE id = $1', [
        privado.id,
        secciones.otroCurso,
      ]),
    ).rejects.toMatchObject({
      driverError: { code: '23503', constraint: 'fk_anuncio_seccion' },
    })
  })

  it('un anuncio de sección archivado deja de aparecer', async () => {
    await bd.query('UPDATE anuncio SET archived_at = now() WHERE id = $1', [
      privado.id,
    ])
    expect(await listar(ALUMNO, secciones.s1)).not.toContainEqual(
      expect.objectContaining(privado),
    )
  })
})

describe('ANU-03: lectura cronológica del alumno', () => {
  it('mezcla generales y propios por fecha, desempata de forma estable y excluye los demás', async () => {
    const creados: Anuncio[] = []
    const crear = async (
      seccionId: string,
      titulo: string,
      fecha: string,
      privado = false,
    ) => {
      const anuncio = await publicar(
        seccionId === secciones.s2 ? demo.profesor2 : PROFESOR,
        seccionId,
        {
          titulo,
          cuerpo: `Contenido de ${titulo}\nSegunda línea.`,
          ...(privado ? { seccionId } : {}),
        },
      )
      creados.push(anuncio)
      await bd.query('UPDATE anuncio SET created_at = $2 WHERE id = $1', [
        anuncio.id,
        fecha,
      ])
      return { ...anuncio, publicadoEn: fecha }
    }

    try {
      // Se insertan fuera de orden cronológico y con dos fechas iguales. Las
      // fechas futuras separan estos anuncios de los creados por ANU-01/02.
      const reciente = await crear(
        secciones.s2,
        'ANU-03 general reciente',
        '2090-10-03T12:00:00.000Z',
      )
      const antiguo = await crear(
        secciones.s1,
        'ANU-03 general antiguo',
        '2090-10-01T12:00:00.000Z',
      )
      const propio = await crear(
        secciones.s1,
        'ANU-03 privado propio',
        reciente.publicadoEn,
        true,
      )
      const ajeno = await crear(
        secciones.s2,
        'ANU-03 privado ajeno',
        '2090-10-04T12:00:00.000Z',
        true,
      )
      const otroCurso = await crear(
        secciones.otroCurso,
        'ANU-03 otro curso',
        '2090-10-05T12:00:00.000Z',
      )
      const archivado = await crear(
        secciones.s1,
        'ANU-03 archivado',
        '2090-10-06T12:00:00.000Z',
      )
      await bd.query('UPDATE anuncio SET archived_at = now() WHERE id = $1', [
        archivado.id,
      ])

      const empate = [reciente, propio].sort((a, b) => (a.id < b.id ? 1 : -1))
      const esperado = [...empate, antiguo]
      for (let lectura = 0; lectura < 2; lectura++) {
        const lista = await listar(ALUMNO, secciones.s1)
        // Compara también título, cuerpo multilínea, autor, fecha ISO y destino.
        expect(lista.slice(0, 3)).toMatchObject(esperado)
        for (const oculto of [ajeno, otroCurso, archivado]) {
          expect(JSON.stringify(lista)).not.toContain(oculto.id)
          expect(JSON.stringify(lista)).not.toContain(oculto.titulo)
          expect(JSON.stringify(lista)).not.toContain(oculto.cuerpo)
        }
      }
      // Otro alumno del mismo curso recibe los generales y su propio privado.
      const otraSeccion = await listar(demo.alumno2, secciones.s2)
      expect(otraSeccion.slice(0, 3)).toMatchObject([ajeno, reciente, antiguo])
      expect(otraSeccion).not.toContainEqual(expect.objectContaining(propio))
    } finally {
      await bd.query(
        'UPDATE anuncio SET archived_at = now() WHERE id = ANY($1::uuid[])',
        [creados.map((anuncio) => anuncio.id)],
      )
    }
  })
})

describe('ANU-04: anuncios nuevos por alumno', () => {
  beforeEach(async () => {
    await bd.query(
      'UPDATE anuncio SET archived_at = now() WHERE archived_at IS NULL',
    )
  })

  const crear = (titulo: string, seccionId = secciones.s1, privado = false) =>
    publicar(
      seccionId === secciones.s2 ? demo.profesor2 : PROFESOR,
      seccionId,
      {
        titulo,
        cuerpo: `Contenido ${titulo}`,
        ...(privado ? { seccionId } : {}),
      },
    )

  async function marcar(
    correo: string,
    seccionId: string,
    anuncioIds: unknown,
    estado = 204,
    extra = {},
  ) {
    const token = await tokenDe(correo)
    return request(app.getHttpServer())
      .post(`/api/espacio/secciones/${seccionId}/anuncios/lecturas`)
      .set('Authorization', `Bearer ${token}`)
      .send({ anuncioIds, ...extra })
      .expect(estado)
  }

  async function contador(correo: string, seccionId: string) {
    const token = await tokenDe(correo)
    const respuesta = await request(app.getHttpServer())
      .get('/api/dashboard/secciones-alumno')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    return (respuesta.body as SeccionAlumno[]).find((s) => s.id === seccionId)
      ?.anunciosNuevos
  }

  it('la primera visita distingue generales y propios; listar o abrir el dashboard no marca lectura', async () => {
    const general = await crear('General')
    const propio = await crear('Propio', secciones.s1, true)
    await crear('Ajeno', secciones.s2, true)
    await crear('Otro curso', secciones.otroCurso)
    const archivado = await crear('Archivado')
    await bd.query('UPDATE anuncio SET archived_at = now() WHERE id = $1', [
      archivado.id,
    ])
    expect(await contador(ALUMNO, secciones.s1)).toBe(2)
    expect(await contador(demo.alumno2, secciones.s2)).toBe(2)
    for (let intento = 0; intento < 2; intento++) {
      const lista = await listar(ALUMNO, secciones.s1)
      expect(lista).toHaveLength(2)
      expect(lista.map((a) => a.id).sort()).toEqual(
        [general.id, propio.id].sort(),
      )
      expect(lista.every((a) => a.nuevo === true)).toBe(true)
      expect(await contador(ALUMNO, secciones.s1)).toBe(2)
    }
  })

  it('al abrir anuncios baja el contador y la siguiente visita conserva la lectura entre sesiones', async () => {
    const general = await crear('Leer general')
    const propio = await crear('Leer propio', secciones.s1, true)
    await marcar(ALUMNO, secciones.s1, [general.id, propio.id])
    expect(await contador(ALUMNO, secciones.s1)).toBe(0)
    tokens.delete(ALUMNO) // Nuevo login, mismo alumno; no depende del navegador.
    expect(
      (await listar(ALUMNO, secciones.s1)).every((a) => a.nuevo === false),
    ).toBe(true)
    // Otro alumno mantiene su estado propio, incluso para el mismo general.
    expect(await contador(demo.alumno2, secciones.s2)).toBe(1)
    expect((await listar(demo.alumno2, secciones.s2))[0].nuevo).toBe(true)
  })

  it('una publicación entre el GET y el registro queda nueva, aunque comparta fecha', async () => {
    const anterior = await crear('Visible al abrir')
    const lista = await listar(ALUMNO, secciones.s1)
    const durante = await crear('Llegó durante la visita')
    await bd.query('UPDATE anuncio SET created_at = $2 WHERE id = $1', [
      durante.id,
      anterior.publicadoEn,
    ])
    await marcar(
      ALUMNO,
      secciones.s1,
      lista.map((a) => a.id),
    )
    expect(await contador(ALUMNO, secciones.s1)).toBe(1)
    const siguiente = await listar(ALUMNO, secciones.s1)
    expect(siguiente.find((a) => a.id === durante.id)?.nuevo).toBe(true)
    expect(siguiente.find((a) => a.id === anterior.id)?.nuevo).toBe(false)
  })

  it('dos pestañas pueden registrar los mismos IDs sin duplicados ni cambiar la fecha original', async () => {
    const a = await crear('Pestaña A')
    const b = await crear('Pestaña B')
    await tokenDe(ALUMNO)
    await Promise.all([
      marcar(ALUMNO, secciones.s1, [a.id, b.id]),
      marcar(ALUMNO, secciones.s1, [b.id, a.id]),
    ])
    const alumno = await idDe(ALUMNO)
    const antes = await bd.query<{ anuncio_id: string; visto_en: Date }[]>(
      'SELECT anuncio_id, visto_en FROM lectura_anuncio WHERE alumno_id = $1 ORDER BY anuncio_id',
      [alumno],
    )
    await marcar(ALUMNO, secciones.s1, [a.id])
    expect(
      await bd.query(
        'SELECT anuncio_id, visto_en FROM lectura_anuncio WHERE alumno_id = $1 ORDER BY anuncio_id',
        [alumno],
      ),
    ).toEqual(antes)
    expect(
      antes.filter((fila: { anuncio_id: string }) =>
        [a.id, b.id].includes(fila.anuncio_id),
      ),
    ).toHaveLength(2)
    expect(await contador(ALUMNO, secciones.s1)).toBe(0)
  })

  it('manipular IDs no registra privados ajenos ni anuncios de otro curso, archivados o universidad', async () => {
    const general = await crear('Permitido')
    const ajeno = await crear('Privado sección 2', secciones.s2, true)
    const otro = await crear('Curso diferente', secciones.otroCurso)
    const archivado = await crear('Ya archivado')
    await bd.query('UPDATE anuncio SET archived_at = now() WHERE id = $1', [
      archivado.id,
    ])
    const [sur] = await bd.query<{ id: string }[]>(
      `INSERT INTO anuncio (universidad_id,curso_id,autor_id,titulo,cuerpo)
      SELECT c.universidad_id,c.id,u.id,'Sur','Solo Sur' FROM curso c JOIN usuario u ON u.universidad_id=c.universidad_id
      WHERE u.correo=$1 LIMIT 1 RETURNING id`,
      [PROFESOR_SUR],
    )
    const ids = [
      general.id,
      ajeno.id,
      otro.id,
      archivado.id,
      sur.id,
      '00000000-0000-4000-8000-000000000099',
    ]
    await marcar(ALUMNO, secciones.s1, ids)
    const filas = await bd.query<{ anuncio_id: string }[]>(
      'SELECT anuncio_id FROM lectura_anuncio WHERE alumno_id=$1 AND anuncio_id=ANY($2::uuid[])',
      [await idDe(ALUMNO), ids],
    )
    expect(filas.map((f) => f.anuncio_id)).toEqual([general.id])
    expect(await contador(demo.alumno2, secciones.s2)).toBe(2)
  })

  it('un general leído en una sección no vuelve a contarse en otra inscripción del mismo curso', async () => {
    const general = await crear('Mismo curso')
    const alumno = await idDe(ALUMNO)
    const [inscripcion] = await bd.query<{ id: string }[]>(
      `INSERT INTO inscripcion (universidad_id,seccion_id,usuario_id)
      SELECT universidad_id,id,$2 FROM seccion WHERE id=$1 RETURNING id`,
      [secciones.s2, alumno],
    )
    try {
      await marcar(ALUMNO, secciones.s1, [general.id])
      expect(await contador(ALUMNO, secciones.s1)).toBe(0)
      expect(await contador(ALUMNO, secciones.s2)).toBe(0)
    } finally {
      await bd.query(
        'UPDATE inscripcion SET archived_at=now(), archivada_por=$2 WHERE id=$1',
        [inscripcion.id, await idDe(ADMIN_INGENIERIA)],
      )
    }
  })

  it.each([PROFESOR, AYUDANTE, DIRECTOR, ADMIN_INGENIERIA])(
    '%s no registra lectura de alumno',
    async (correo) => {
      const anuncio = await crear('Solo lectura de alumno')
      await marcar(correo, secciones.s1, [anuncio.id], 403)
    },
  )

  it('una inscripción retirada o una sección ajena impiden marcar', async () => {
    const anuncio = await crear('Acceso revocado')
    await marcar(demo.alumno2, secciones.s1, [anuncio.id], 403)
    const alumno = await idDe(ALUMNO)
    const filas = await bd.query<{ id: string }[]>(
      `WITH retiradas AS (UPDATE inscripcion SET archived_at=now(),archivada_por=$3
       WHERE usuario_id=$1 AND seccion_id=$2 AND archived_at IS NULL RETURNING id)
       SELECT id FROM retiradas`,
      [alumno, secciones.s1, await idDe(ADMIN_INGENIERIA)],
    )
    try {
      await marcar(ALUMNO, secciones.s1, [anuncio.id], 403)
    } finally {
      await bd.query(
        'UPDATE inscripcion SET archived_at=NULL,archivada_por=NULL WHERE id=ANY($1::uuid[])',
        [filas.map((f) => f.id)],
      )
    }
  })

  it.each(
    [
      undefined,
      'no-array',
      [1],
      ['no-uuid'],
      [
        '00000000-0000-4000-8000-000000000099',
        '00000000-0000-4000-8000-000000000099',
      ],
      Array.from(
        { length: MAX_ANUNCIOS_LECTURA + 1 },
        (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      ),
    ].map((ids) => ({ ids })),
  )('rechaza un body inválido: %j', async ({ ids }) => {
    await marcar(ALUMNO, secciones.s1, ids, 400)
  })

  it('no admite cambiar el alumno desde el body', async () => {
    await marcar(ALUMNO, secciones.s1, [], 400, {
      alumnoId: await idDe(demo.alumno2),
    })
    await marcar(ALUMNO, secciones.s1, [])
  })

  it('una publicación sin commit al abrir tampoco se pierde al registrar la visita', async () => {
    const visible = await crear('Ya publicado')
    const q = bd.createQueryRunner()
    await q.startTransaction()
    try {
      const [pendiente] = await bd.query<{ id: string }[]>(
        `INSERT INTO anuncio (universidad_id,curso_id,autor_id,titulo,cuerpo)
        SELECT universidad_id,curso_id,profesor_id,'Commit tardío','Aún no visible' FROM seccion WHERE id=$1 RETURNING id`,
        [secciones.s1],
        q,
      )
      const lista = await listar(ALUMNO, secciones.s1)
      expect(lista.map((a) => a.id)).toEqual([visible.id])
      await marcar(
        ALUMNO,
        secciones.s1,
        lista.map((a) => a.id),
      )
      await q.commitTransaction()
      expect(await contador(ALUMNO, secciones.s1)).toBe(1)
      expect(
        (await listar(ALUMNO, secciones.s1)).find((a) => a.id === pendiente.id)
          ?.nuevo,
      ).toBe(true)
    } finally {
      if (q.isTransactionActive) await q.rollbackTransaction()
      await q.release()
    }
  })

  it('RLS aísla las lecturas por universidad y solo permite al alumno insertar; son inmutables', async () => {
    const anuncio = await crear('RLS lecturas')
    await marcar(ALUMNO, secciones.s1, [anuncio.id])
    const [{ universidad_id: norte }] = await bd.query<
      { universidad_id: string }[]
    >('SELECT universidad_id FROM anuncio WHERE id=$1', [anuncio.id])
    const [{ id: sur }] = await bd.query<{ id: string }[]>(
      'SELECT id FROM universidad WHERE dominio_correo=$1',
      ['sur.cursus.test'],
    )
    const como = async (universidad: string, rol: string, sql: string) => {
      const q = bd.createQueryRunner()
      await q.startTransaction()
      try {
        await q.query(`SET LOCAL ROLE ${ROL_APP}`)
        await q.query(
          `SELECT set_config('app.universidad_id',$1,true),set_config('app.rol',$2,true)`,
          [universidad, rol],
        )
        return await bd.query<unknown>(sql, [anuncio.id], q)
      } finally {
        await q.rollbackTransaction()
        await q.release()
      }
    }
    expect(
      await como(
        norte,
        'ALUMNO',
        'SELECT anuncio_id FROM lectura_anuncio WHERE anuncio_id=$1',
      ),
    ).toHaveLength(1)
    expect(
      await como(
        sur,
        'ALUMNO',
        'SELECT anuncio_id FROM lectura_anuncio WHERE anuncio_id=$1',
      ),
    ).toEqual([])
    expect(
      await como(
        '',
        'ALUMNO',
        'SELECT anuncio_id FROM lectura_anuncio WHERE anuncio_id=$1',
      ),
    ).toEqual([])
    expect(
      await como(
        norte,
        'PROFESOR',
        'SELECT anuncio_id FROM lectura_anuncio WHERE anuncio_id=$1',
      ),
    ).toEqual([])
    await expect(
      como(
        norte,
        'ALUMNO',
        'UPDATE lectura_anuncio SET visto_en=now() WHERE anuncio_id=$1',
      ),
    ).rejects.toMatchObject({ code: '42501' })
    await expect(
      como(norte, 'ALUMNO', 'DELETE FROM lectura_anuncio WHERE anuncio_id=$1'),
    ).rejects.toMatchObject({ code: '42501' })
    await expect(
      bd.query(
        'INSERT INTO lectura_anuncio (universidad_id,alumno_id,anuncio_id) VALUES ($1,$2,$3)',
        [norte, await idDe('alumno@sur.cursus.test'), anuncio.id],
      ),
    ).rejects.toMatchObject({ driverError: { code: '23503' } })
  })

  it('el rollback retira las lecturas sin alterar los anuncios; al reaplicar vuelven a estar nuevos', async () => {
    const anuncio = await crear('Conservar al revertir')
    await marcar(ALUMNO, secciones.s1, [anuncio.id])
    const antes = await bd.query<unknown>('SELECT * FROM anuncio WHERE id=$1', [
      anuncio.id,
    ])
    try {
      await bd.undoLastMigration()
      expect(
        await bd.query('SELECT * FROM anuncio WHERE id=$1', [anuncio.id]),
      ).toEqual(antes)
    } finally {
      await bd.runMigrations()
    }
    expect(await contador(ALUMNO, secciones.s1)).toBe(1)
    expect((await listar(ALUMNO, secciones.s1))[0].nuevo).toBe(true)
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
    for (const dominio of ['norte.cursus.test', 'sur.cursus.test']) {
      const propias = await bd.query<{ id: string }[]>(
        `SELECT a.id FROM anuncio a JOIN universidad u ON u.id=a.universidad_id
        WHERE u.dominio_correo=$1 ORDER BY a.id`,
        [dominio],
      )
      expect(
        await comoApp(
          'ALUMNO',
          'SELECT id FROM anuncio ORDER BY id',
          [],
          dominio,
        ),
      ).toEqual(propias)
    }
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

describe('reversión de ANU-02', () => {
  it('archiva los anuncios privados antes de quitar el destinatario, conservando los generales', async () => {
    const privado = await publicar(PROFESOR, secciones.s1, {
      titulo: 'Privado al revertir',
      cuerpo: 'Solo el grupo',
      seccionId: secciones.s1,
    })
    const general = await publicar(PROFESOR, secciones.s1, {
      titulo: 'General al revertir',
      cuerpo: 'Todos los grupos',
    })
    // Ejecuta el down y el up de la migración directamente: no es la última
    // registrada (MAT-08 vino después), así que undoLastMigration no sirve.
    const migracion = new DirigirAnuncioSeccion1792600000000()
    const q = bd.createQueryRunner()
    try {
      await migracion.down(q)
      const filas = await bd.query<{ id: string; archived_at: Date | null }[]>(
        'SELECT id, archived_at FROM anuncio WHERE id = ANY($1::uuid[])',
        [[privado.id, general.id]],
      )
      expect(
        filas.find((a) => a.id === privado.id)?.archived_at,
      ).toBeInstanceOf(Date)
      expect(filas.find((a) => a.id === general.id)?.archived_at).toBeNull()
    } finally {
      await migracion.up(q)
      await q.release()
    }
  })
})
