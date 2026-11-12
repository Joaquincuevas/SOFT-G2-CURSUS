import type { CierreCurso, CursoDetalle } from '@cursus/shared'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { DataSource } from 'typeorm'
import { AppModule } from '../../src/app.module.js'
import type { RespuestaLogin } from '../../src/auth/auth.controller.js'
import { configurarApp } from '../../src/config/configurar-app.js'
import { opcionesDataSource } from '../../src/database/data-source.js'
import { ejecutarSeed } from '../../src/database/seed.js'

// Base propia con el seed cargado (cursos con las secciones 1 y 2), que se
// crea y se borra en cada ejecución.
const BD_TEST = `${process.env.POSTGRES_TEST_DB ?? 'cursus_test'}_detalle`
const PASSWORD = 'contraseña-de-prueba'
const BD_ORIGINAL = process.env.POSTGRES_DB

// Usuarios del seed.
const ADMIN_INGENIERIA = 'administrativo.ingenieria@norte.cursus.test'
const ADMIN_ECONOMIA = 'administrativo.economia@norte.cursus.test'
const ADMIN_SUR = 'administrativo@sur.cursus.test'
const DIRECTOR = 'director@norte.cursus.test'
const ALUMNO = 'alumno@norte.cursus.test'
const PROFESOR = 'profesor@norte.cursus.test'
const AYUDANTE = 'ayudante@norte.cursus.test'

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
async function detalle(correo: string, id: string, estado = 200) {
  const token = await tokenDe(correo)
  const respuesta = await request(app.getHttpServer())
    .get(`/api/cursos/${id}`)
    .set('Authorization', `Bearer ${token}`)
    .expect(estado)
  return respuesta.body as CursoDetalle
}

async function cerrar(correo: string, id: string, estado: number) {
  const token = await tokenDe(correo)
  return request(app.getHttpServer())
    .post(`/api/cursos/${id}/cierre`)
    .set('Authorization', `Bearer ${token}`)
    .expect(estado)
}

const idDe = async (codigo: string) =>
  (
    await bd.query<{ id: string }[]>('SELECT id FROM curso WHERE codigo = $1', [
      codigo,
    ])
  )[0].id

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
  await app.init()
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

describe('GET /api/cursos/:id', () => {
  it('devuelve el curso con sus secciones ordenadas por número', async () => {
    const id = await idDe('ICC101')
    // Una tercera sección creada antes que la 2, para revisar el orden.
    await bd.query(
      `INSERT INTO seccion (universidad_id, curso_id, numero)
       SELECT universidad_id, id, 3 FROM curso WHERE id = $1`,
      [id],
    )
    await bd.query(
      "UPDATE seccion SET created_at = now() - interval '1 day' WHERE numero = 3",
    )

    const curso = await detalle(ADMIN_INGENIERIA, id)
    expect(curso).toEqual({
      id,
      codigo: 'ICC101',
      nombre: 'Introducción a la Programación',
      carreraNombre: 'Ingeniería Civil en Informática',
      periodo: { id: expect.any(String) as string, anio: 2026, semestre: 2 },
      secciones: [1, 2, 3].map((numero) => ({
        id: expect.any(String) as string,
        numero,
        horario: null,
        profesor: null,
        profesorId: null,
        profesores: [],
        ayudantes: [],
        alumnos: 0,
      })),
    })
  })

  it('no incluye las secciones archivadas', async () => {
    const id = await idDe('ICC201')
    await bd.query(
      'UPDATE seccion SET archived_at = now() WHERE curso_id = $1 AND numero = 2',
      [id],
    )
    const curso = await detalle(ADMIN_INGENIERIA, id)
    expect(curso.secciones.map((s) => s.numero)).toEqual([1])
  })

  it('devuelve un curso sin secciones con la lista vacía', async () => {
    const id = await idDe('ICO201')
    await bd.query(
      'UPDATE seccion SET archived_at = now() WHERE curso_id = $1',
      [id],
    )
    const curso = await detalle(ADMIN_ECONOMIA, id)
    expect(curso).toMatchObject({ codigo: 'ICO201', secciones: [] })
  })

  it('el listado cuenta las secciones vigentes de cada curso', async () => {
    const token = await tokenDe(ADMIN_INGENIERIA)
    const respuesta = await request(app.getHttpServer())
      .get('/api/cursos')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    const secciones = Object.fromEntries(
      (respuesta.body as { codigo: string; secciones: number }[]).map((c) => [
        c.codigo,
        c.secciones,
      ]),
    )
    expect(secciones).toEqual({ ICC101: 3, ICC201: 1 })
  })

  it('responde 404 con un curso de otra universidad', async () => {
    await detalle(ADMIN_SUR, await idDe('ICC101'), 404)
  })

  it('responde 404 con un curso de otra facultad', async () => {
    await detalle(ADMIN_ECONOMIA, await idDe('ICC101'), 404)
  })

  it('responde 404 con un curso que no existe', async () => {
    await detalle(ADMIN_INGENIERIA, '00000000-0000-4000-8000-000000000000', 404)
  })

  it('responde 404 con un curso archivado', async () => {
    const id = await idDe('ICO101')
    await bd.query('UPDATE curso SET archived_at = now() WHERE id = $1', [id])
    try {
      await detalle(ADMIN_ECONOMIA, id, 404)
    } finally {
      await bd.query('UPDATE curso SET archived_at = NULL WHERE id = $1', [id])
    }
  })

  it('responde 400 con un id que no es uuid', async () => {
    await detalle(ADMIN_INGENIERIA, 'no-es-uuid', 400)
  })

  it('el Director ve el detalle de un curso de otra universidad', async () => {
    const curso = await detalle(DIRECTOR, await idDe('ENF101'))
    expect(curso).toMatchObject({
      codigo: 'ENF101',
      universidadNombre: 'Universidad Demo Sur',
    })
    expect(curso.secciones.map((s) => s.numero)).toEqual([1, 2])
  })
})

describe('POST /api/cursos/:id/cierre (HIS-01)', () => {
  it('rechaza el cierre fuera de la facultad o universidad y a un Director', async () => {
    const curso = await idDe('ICC101')
    await cerrar(ADMIN_ECONOMIA, curso, 404)
    await cerrar(ADMIN_SUR, curso, 404)
    await cerrar(DIRECTOR, curso, 403)
  })

  it('exige notas publicadas y 100 % por sección antes de registrar un solo cierre', async () => {
    const [{ id: curso }] = await bd.query<{ id: string }[]>(
      `INSERT INTO curso (universidad_id, carrera_id, periodo_id, codigo, nombre)
       SELECT universidad_id, carrera_id, periodo_id, 'HIS01', 'Curso de cierre'
         FROM curso WHERE codigo = 'ICC101' RETURNING id`,
    )
    await bd.query(
      `INSERT INTO seccion (universidad_id, curso_id, numero)
       SELECT universidad_id, id, numero FROM curso CROSS JOIN (VALUES (1), (2), (3)) AS n(numero)
        WHERE id = $1`,
      [curso],
    )
    const evaluaciones = await bd.query<{ id: string; nombre: string }[]>(
      `INSERT INTO evaluacion (universidad_id, seccion_id, nombre, fecha, ponderacion, creada_por)
       SELECT s.universidad_id, s.id, 'Control ' || s.numero, current_date,
              CASE WHEN s.numero = 1 THEN 80 ELSE 100 END, u.id
         FROM seccion s JOIN usuario u ON u.universidad_id = s.universidad_id
        WHERE s.curso_id = $1 AND s.numero IN (1, 2) AND u.correo = $2
        RETURNING id, nombre`,
      [curso, PROFESOR],
    )
    await bd.query(
      `INSERT INTO evaluacion (universidad_id, seccion_id, nombre, fecha, ponderacion, creada_por, archived_at)
       SELECT universidad_id, seccion_id, 'Control archivado', fecha, 20, creada_por, now()
         FROM evaluacion WHERE id = $1`,
      [evaluaciones.find((e) => e.nombre === 'Control 1')?.id],
    )
    await bd.query(
      `INSERT INTO inscripcion (universidad_id, seccion_id, usuario_id)
       SELECT s.universidad_id, s.id, u.id
         FROM seccion s JOIN usuario u ON u.universidad_id = s.universidad_id
        WHERE s.curso_id = $1 AND s.numero IN (1, 2) AND u.correo = $2
       ON CONFLICT DO NOTHING`,
      [curso, ALUMNO],
    )
    await bd.query(
      `INSERT INTO nota (universidad_id, evaluacion_id, alumno_id, valor, propuesta_por)
       SELECT e.universidad_id, e.id, a.id, 5.0, y.id
         FROM evaluacion e
         JOIN usuario a ON a.universidad_id = e.universidad_id AND a.correo = $2
         JOIN usuario y ON y.universidad_id = e.universidad_id AND y.correo = $3
        WHERE e.id = $1`,
      [
        evaluaciones.find((e) => e.nombre === 'Control 1')?.id,
        ALUMNO,
        AYUDANTE,
      ],
    )

    const intento = await cerrar(ADMIN_INGENIERIA, curso, 409)
    const ponderaciones = [
      { seccion: 1, sumaPonderaciones: 80, faltan: 20, sobran: 0 },
      { seccion: 3, sumaPonderaciones: 0, faltan: 100, sobran: 0 },
    ]
    expect(intento.body).toEqual({
      message: 'Hay requisitos pendientes para cerrar el curso.',
      ponderaciones,
      pendientes: [1, 2].map((seccion) => ({
        evaluacionId: evaluaciones.find(
          (e) => e.nombre === `Control ${seccion}`,
        )?.id,
        nombre: `Control ${seccion}`,
        seccion,
        notasPendientes: 1,
      })),
    })
    expect((await detalle(ADMIN_INGENIERIA, curso)).cierre).toBeUndefined()
    await bd.query(
      `INSERT INTO nota (universidad_id, evaluacion_id, alumno_id, valor, propuesta_por, estado)
       SELECT e.universidad_id, e.id, a.id, 5.0, y.id, 'PUBLICADA'
         FROM evaluacion e
         JOIN inscripcion i ON i.seccion_id = e.seccion_id AND i.archived_at IS NULL
         JOIN usuario a ON a.id = i.usuario_id AND a.rol = 'ALUMNO' AND a.archived_at IS NULL
         JOIN usuario y ON y.universidad_id = e.universidad_id AND y.correo = $2
        WHERE e.id = ANY($1::uuid[])
       ON CONFLICT (evaluacion_id, alumno_id) WHERE archived_at IS NULL
       DO UPDATE SET estado = 'PUBLICADA'`,
      [evaluaciones.map((e) => e.id), AYUDANTE],
    )

    expect((await cerrar(ADMIN_INGENIERIA, curso, 409)).body).toMatchObject({
      pendientes: [],
      ponderaciones,
    })
    expect((await detalle(ADMIN_INGENIERIA, curso)).cierre).toBeUndefined()
    await bd.query(
      `WITH complemento AS (
         INSERT INTO evaluacion (universidad_id, seccion_id, nombre, fecha, ponderacion, creada_por)
         SELECT universidad_id, seccion_id, 'Control complementario', fecha, 20, creada_por
           FROM evaluacion WHERE id = $1
         RETURNING id, universidad_id
       )
       INSERT INTO nota (universidad_id, evaluacion_id, alumno_id, valor, propuesta_por, estado)
       SELECT c.universidad_id, c.id, n.alumno_id, n.valor, n.propuesta_por, 'PUBLICADA'
         FROM complemento c CROSS JOIN nota n WHERE n.evaluacion_id = $1`,
      [evaluaciones.find((e) => e.nombre === 'Control 1')?.id],
    )
    await bd.query(
      `UPDATE seccion SET archived_at = now() WHERE curso_id = $1 AND numero = 3`,
      [curso],
    )

    const [actor] = await bd.query<{ id: string }[]>(
      'SELECT id FROM usuario WHERE correo = $1',
      [ADMIN_INGENIERIA],
    )
    const respuesta = await cerrar(ADMIN_INGENIERIA, curso, 200)
    const cierre = respuesta.body as CierreCurso
    expect(cierre.responsableId).toBe(actor.id)
    expect(Number.isFinite(Date.parse(cierre.fecha))).toBe(true)
    expect((await detalle(ADMIN_INGENIERIA, curso)).cierre).toEqual(cierre)
    expect((await cerrar(ADMIN_INGENIERIA, curso, 200)).body).toEqual(cierre)

    const universidades = await bd.query<{ universidad_id: string }[]>(
      'SELECT universidad_id FROM usuario WHERE correo IN ($1, $2) ORDER BY correo',
      [ADMIN_SUR, PROFESOR],
    )
    await bd.transaction(async (tx) => {
      await tx.query('SET LOCAL ROLE cursus_app')
      await tx.query("SELECT set_config('app.rol', 'PROFESOR', true)")
      for (const [i, { universidad_id }] of universidades.entries()) {
        await tx.query("SELECT set_config('app.universidad_id', $1, true)", [
          universidad_id,
        ])
        expect(
          await tx.query('SELECT curso_cerrado($1) AS cerrado', [curso]),
        ).toEqual([{ cerrado: i === 1 }])
      }
    })
  })
})

describe('HIS-02 · registro académico de un curso cerrado', () => {
  it('rechaza escrituras de todos los roles y conserva las lecturas', async () => {
    const [{ id: curso }] = await bd.query<{ id: string }[]>(
      `INSERT INTO curso (universidad_id, carrera_id, periodo_id, codigo, nombre)
       SELECT universidad_id, carrera_id, periodo_id, 'HIS02', 'Curso protegido'
         FROM curso WHERE codigo = 'ICC101' RETURNING id`,
    )
    const [ids] = await bd.query<
      {
        universidad: string
        profesor: string
        ayudante: string
        alumno: string
      }[]
    >(
      `SELECT p.universidad_id AS universidad, p.id AS profesor, y.id AS ayudante, a.id AS alumno
         FROM usuario p CROSS JOIN usuario y CROSS JOIN usuario a
        WHERE p.correo = $1 AND y.correo = $2 AND a.correo = $3`,
      [PROFESOR, AYUDANTE, ALUMNO],
    )
    const superadmin = 'superadmin-his02@cursus.test'
    await bd.query(
      `INSERT INTO usuario (correo, nombre, password_hash, rol)
       SELECT $1, 'Superadmin de prueba', password_hash, 'SUPERADMIN'
         FROM usuario WHERE id = $2`,
      [superadmin, ids.profesor],
    )
    const [{ id: seccion }] = await bd.query<{ id: string }[]>(
      `INSERT INTO seccion (universidad_id, curso_id, numero, profesor_id)
       VALUES ($1, $2, 1, $3) RETURNING id`,
      [ids.universidad, curso, ids.profesor],
    )
    await bd.query(
      'INSERT INTO ayudante_seccion (universidad_id, seccion_id, usuario_id) VALUES ($1, $2, $3)',
      [ids.universidad, seccion, ids.ayudante],
    )
    await bd.query(
      'INSERT INTO inscripcion (universidad_id, seccion_id, usuario_id) VALUES ($1, $2, $3)',
      [ids.universidad, seccion, ids.alumno],
    )
    const [{ id: evaluacion }] = await bd.query<{ id: string }[]>(
      `INSERT INTO evaluacion (universidad_id, seccion_id, nombre, fecha, ponderacion, creada_por)
       VALUES ($1, $2, 'Control', '2026-11-02', 100, $3) RETURNING id`,
      [ids.universidad, seccion, ids.profesor],
    )
    await bd.query(
      `INSERT INTO nota (universidad_id, evaluacion_id, alumno_id, valor, estado, propuesta_por)
       VALUES ($1, $2, $3, 5, 'PUBLICADA', $4)`,
      [ids.universidad, evaluacion, ids.alumno, ids.ayudante],
    )
    await bd.query(
      `INSERT INTO revision_notas (universidad_id, evaluacion_id, estado, actualizado_por)
       VALUES ($1, $2, 'APROBADA', $3)`,
      [ids.universidad, evaluacion, ids.profesor],
    )
    const [{ id: clase }] = await bd.query<{ id: string }[]>(
      `INSERT INTO clase (universidad_id, seccion_id, fecha, inicio, termino, sala, creada_por)
       VALUES ($1, $2, '2026-11-02', '09:00', '10:00', 'A1', $3) RETURNING id`,
      [ids.universidad, seccion, ids.profesor],
    )
    await bd.query(
      `INSERT INTO asistencia (universidad_id, clase_id, alumno_id, presente, registrada_por)
       VALUES ($1, $2, $3, true, $4)`,
      [ids.universidad, clase, ids.alumno, ids.profesor],
    )
    await cerrar(ADMIN_INGENIERIA, curso, 200)

    const ruta = `/api/espacio/secciones/${seccion}`
    const evaluaciones = `${ruta}/evaluaciones`
    const notas = `${evaluaciones}/${evaluacion}/notas`
    const asistencia = `${ruta}/clases/${clase}/asistencia`
    const cambioEvaluacion = {
      nombre: 'Editada',
      fecha: '2026-11-02',
      ponderacion: 100,
    }
    const cambioNota = { notas: [{ alumnoId: ids.alumno, nota: 6 }] }
    const marcas = { marcas: [{ alumnoId: ids.alumno, presente: false }] }
    for (const correo of [
      DIRECTOR,
      ADMIN_INGENIERIA,
      PROFESOR,
      AYUDANTE,
      ALUMNO,
      superadmin,
    ]) {
      const auth = `Bearer ${await tokenDe(correo)}`
      const api = request(app.getHttpServer())
      await api
        .put(`${evaluaciones}/${evaluacion}`)
        .set('Authorization', auth)
        .send(cambioEvaluacion)
        .expect(403)
      await api
        .put(notas)
        .set('Authorization', auth)
        .send(cambioNota)
        .expect(403)
      await api
        .post(asistencia)
        .set('Authorization', auth)
        .send(marcas)
        .expect(403)
    }
    const profesor = `Bearer ${await tokenDe(PROFESOR)}`
    const ayudante = `Bearer ${await tokenDe(AYUDANTE)}`
    const api = request(app.getHttpServer())
    const mensaje = {
      statusCode: 403,
      message: 'Curso cerrado',
      error: 'Forbidden',
    }
    await api
      .post(evaluaciones)
      .set('Authorization', profesor)
      .send(cambioEvaluacion)
      .expect(403, mensaje)
    await api
      .post(`${ruta}/clases`)
      .set('Authorization', profesor)
      .send({ fecha: '2026-11-02', inicio: '09:00' })
      .expect(403, mensaje)
    await api
      .post(`${notas}/envio`)
      .set('Authorization', ayudante)
      .expect(403, mensaje)
    await api
      .post(`${notas}/aprobacion`)
      .set('Authorization', profesor)
      .expect(403, mensaje)
    await api
      .post(`${notas}/devolucion`)
      .set('Authorization', profesor)
      .send({ comentario: 'Revisar' })
      .expect(403, mensaje)
    await api
      .post(`${notas}/${ids.alumno}/recorreccion`)
      .set('Authorization', profesor)
      .send({ notaAnterior: 5, notaNueva: 6, motivo: 'Revisar' })
      .expect(403, mensaje)
    await api
      .patch(`${asistencia}/alumnos/${ids.alumno}`)
      .set('Authorization', profesor)
      .send({ anterior: true, presente: false, motivo: 'Revisar' })
      .expect(403, mensaje)
    expect(
      (
        await api
          .get(`${ruta}/resumen`)
          .set('Authorization', profesor)
          .expect(200)
      ).body,
    ).toMatchObject({ cursoCerrado: true })
    expect(
      (await api.get(notas).set('Authorization', profesor).expect(200)).body,
    ).toMatchObject({ cursoCerrado: true, alumnos: [{ nota: 5 }] })
    expect(
      (await api.get(asistencia).set('Authorization', profesor).expect(200))
        .body,
    ).toMatchObject({ alumnos: [{ presente: true }] })

    for (const [tabla, columna, id] of [
      ['evaluacion', 'id', evaluacion],
      ['nota', 'evaluacion_id', evaluacion],
      ['revision_notas', 'evaluacion_id', evaluacion],
      ['clase', 'id', clase],
      ['asistencia', 'clase_id', clase],
    ]) {
      await expect(
        bd.query(
          `UPDATE ${tabla} SET updated_at = now() WHERE ${columna} = $1`,
          [id],
        ),
      ).rejects.toThrow('Curso cerrado')
    }
  })
})
