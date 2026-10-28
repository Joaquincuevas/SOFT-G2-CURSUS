import type { SeccionAlumno } from '@cursus/shared'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { DataSource } from 'typeorm'
import { AppModule } from '../../src/app.module.js'
import { configurarApp } from '../../src/config/configurar-app.js'
import { opcionesDataSource } from '../../src/database/data-source.js'
import { ejecutarSeed } from '../../src/database/seed.js'

const BD_TEST = `${process.env.POSTGRES_TEST_DB ?? 'cursus_test'}_secciones_alumno`
const BD_ORIGINAL = process.env.POSTGRES_DB
const PASSWORD = 'contraseña-de-prueba'
const ALUMNO = 'alumno@norte.cursus.test'
const RUTA = '/api/dashboard/secciones-alumno'
let admin: DataSource, bd: DataSource, app: INestApplication<App>
let alumno: string, responsable: string, profesor: string, periodo: string
let secciones: {
  id: string
  curso_id: string
  numero: number
  codigo: string
}[]
const tokens = new Map<string, string>()
async function token(correo = ALUMNO) {
  if (!tokens.has(correo)) {
    const r = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ correo, password: PASSWORD })
      .expect(200)
    tokens.set(correo, (r.body as { accessToken: string }).accessToken)
  }
  return tokens.get(correo)!
}
async function listar(correo = ALUMNO, query: Record<string, string> = {}) {
  const sesion = await token(correo)
  const r = await request(app.getHttpServer())
    .get(RUTA)
    .query(query)
    .set('Authorization', `Bearer ${sesion}`)
    .expect(200)
  return r.body as SeccionAlumno[]
}
async function idDe(correo: string) {
  return (
    await bd.query<{ id: string }[]>(
      'SELECT id FROM usuario WHERE correo = $1',
      [correo],
    )
  )[0].id
}
async function inscribir(id: string, usuario = alumno) {
  await bd.query(
    `INSERT INTO inscripcion (universidad_id, seccion_id, usuario_id)
    SELECT universidad_id, id, $2 FROM seccion WHERE id = $1`,
    [id, usuario],
  )
}
beforeAll(async () => {
  admin = await new DataSource(opcionesDataSource()).initialize()
  await admin.query(`DROP DATABASE IF EXISTS "${BD_TEST}" WITH (FORCE)`)
  await admin.query(`CREATE DATABASE "${BD_TEST}"`)
  bd = await new DataSource(opcionesDataSource(BD_TEST)).initialize()
  await bd.runMigrations()
  await ejecutarSeed(bd, PASSWORD)
  alumno = await idDe(ALUMNO)
  responsable = await idDe('administrativo.ingenieria@norte.cursus.test')
  profesor = await idDe('profesor@norte.cursus.test')
  secciones =
    await bd.query(`SELECT s.id, s.curso_id, s.numero, c.codigo FROM seccion s
    JOIN curso c ON c.id = s.curso_id WHERE c.codigo IN ('ICC101','ICC201') ORDER BY c.codigo, s.numero`)
  ;[{ id: periodo }] = await bd.query<{ id: string }[]>(
    'SELECT periodo_id AS id FROM curso WHERE id = $1',
    [secciones[0].curso_id],
  )
  process.env.POSTGRES_DB = BD_TEST
  const modulo = await Test.createTestingModule({
    imports: [AppModule],
  }).compile()
  app = modulo.createNestApplication<INestApplication<App>>({ logger: false })
  configurarApp(app, { secretoOrigen: '' })
  await app.listen(0, '127.0.0.1')
})
beforeEach(async () => {
  await bd.query('TRUNCATE inscripcion, horario_seccion')
  await bd.query('UPDATE seccion SET profesor_id = NULL, archived_at = NULL')
  await bd.query('UPDATE curso SET archived_at = NULL')
  await bd.query('UPDATE usuario SET archived_at = NULL WHERE id = $1', [
    profesor,
  ])
  await inscribir(secciones[0].id)
  await inscribir(secciones[3].id)
  await bd.query('UPDATE seccion SET profesor_id = $1 WHERE id = $2', [
    profesor,
    secciones[0].id,
  ])
  await bd.query(
    `INSERT INTO horario_seccion (universidad_id, seccion_id, dia, inicio, termino, sala, archived_at)
    SELECT universidad_id, id, b.dia, b.inicio::time, b.termino::time, b.sala, b.archivo
    FROM seccion CROSS JOIN (VALUES
      (3, '10:00', '11:00', 'Sala B', NULL::timestamptz),
      (1, '08:30', '09:20', 'Sala A', NULL::timestamptz),
      (2, '08:30', '09:20', 'Antigua', now())) AS b(dia,inicio,termino,sala,archivo)
    WHERE id = $1`,
    [secciones[0].id],
  )
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

describe('ESP-03: cursos del alumno del período activo', () => {
  it('lista únicamente inscripciones propias, con curso, sección, horario ordenado y profesor', async () => {
    const datos = await listar()
    expect(datos.map((s) => s.id)).toEqual([secciones[0].id, secciones[3].id])
    expect(datos[0]).toEqual({
      anunciosNuevos: 0,
      id: secciones[0].id,
      numero: 1,
      curso: {
        id: secciones[0].curso_id,
        codigo: 'ICC101',
        nombre: 'Introducción a la Programación',
      },
      horario: [
        { dia: 1, inicio: '08:30', termino: '09:20', sala: 'Sala A' },
        { dia: 3, inicio: '10:00', termino: '11:00', sala: 'Sala B' },
      ],
      profesor: { id: profesor, nombre: 'Profesor Norte' },
    })
    expect(datos[1]).toMatchObject({ numero: 2, horario: [], profesor: null })
    expect(JSON.stringify(datos)).not.toContain('@')
  })
  it('no agrupa secciones distintas de un curso en una sola tarjeta', async () => {
    await inscribir(secciones[1].id)
    expect((await listar()).map((s) => s.id)).toEqual([
      secciones[0].id,
      secciones[1].id,
      secciones[3].id,
    ])
  })
  it('ignora usuario y universidad indicados en query; usa la sesión', async () => {
    expect(
      await listar(ALUMNO, { usuarioId: responsable, universidadId: 'otra' }),
    ).toEqual(await listar())
  })
  it('una inscripción archivada desaparece y el enlace deja de permitir acceso a la sección', async () => {
    await bd.query(
      'UPDATE inscripcion SET archived_at = now(), archivada_por = $1 WHERE seccion_id = $2',
      [responsable, secciones[0].id],
    )
    expect((await listar()).map((s) => s.id)).toEqual([secciones[3].id])
    const sesion = await token()
    await request(app.getHttpServer())
      .get(`/api/espacio/secciones/${secciones[0].id}/resumen`)
      .set('Authorization', `Bearer ${sesion}`)
      .expect(403)
  })
  it.each(['seccion', 'curso'])('excluye una %s archivada', async (tabla) => {
    await bd.query(`UPDATE ${tabla} SET archived_at = now() WHERE id = $1`, [
      tabla === 'seccion' ? secciones[0].id : secciones[0].curso_id,
    ])
    expect((await listar()).map((s) => s.id)).toEqual([secciones[3].id])
  })
  it('no muestra un profesor archivado', async () => {
    await bd.query('UPDATE usuario SET archived_at = now() WHERE id = $1', [
      profesor,
    ])
    expect((await listar())[0].profesor).toBeNull()
  })
  it('sin período activo responde una lista vacía', async () => {
    await bd.query('UPDATE periodo SET activo = false WHERE id = $1', [periodo])
    try {
      expect(await listar()).toEqual([])
    } finally {
      await bd.query('UPDATE periodo SET activo = true WHERE id = $1', [
        periodo,
      ])
    }
  })
  it('no muestra inscripciones de otro período', async () => {
    const [otro] = await bd.query<{ id: string }[]>(
      `INSERT INTO periodo (universidad_id, anio, semestre, fecha_inicio, fecha_termino, activo)
      SELECT universidad_id, 2025, 1, '2025-03-01', '2025-07-01', false FROM periodo WHERE id = $1 RETURNING id`,
      [periodo],
    )
    await bd.query('UPDATE curso SET periodo_id = $1 WHERE id = $2', [
      otro.id,
      secciones[3].curso_id,
    ])
    try {
      expect((await listar()).map((s) => s.id)).toEqual([secciones[0].id])
    } finally {
      await bd.query('UPDATE curso SET periodo_id = $1 WHERE id = $2', [
        periodo,
        secciones[3].curso_id,
      ])
      await bd.query('DELETE FROM periodo WHERE id = $1', [otro.id])
    }
  })
  it('sin inscripciones no muestra cursos de otros alumnos de la universidad', async () => {
    await bd.query('TRUNCATE inscripcion')
    await inscribir(secciones[0].id, await idDe('ayudante@norte.cursus.test'))
    expect(await listar()).toEqual([])
  })
  it('aísla universidades aun con períodos activos en ambas', async () => {
    const sur = await idDe('alumno@sur.cursus.test')
    const [s] = await bd.query<{ id: string }[]>(
      'SELECT s.id FROM seccion s JOIN usuario u ON u.universidad_id = s.universidad_id WHERE u.id = $1 LIMIT 1',
      [sur],
    )
    await inscribir(s.id, sur)
    expect((await listar('alumno@sur.cursus.test')).map((x) => x.id)).toEqual([
      s.id,
    ])
    expect((await listar()).map((x) => x.id)).toEqual([
      secciones[0].id,
      secciones[3].id,
    ])
  })
  it('las tarjetas abren el resumen autorizado con rol Alumno', async () => {
    const sesion = await token()
    const respuesta = await request(app.getHttpServer())
      .get(`/api/espacio/secciones/${secciones[0].id}/resumen`)
      .set('Authorization', `Bearer ${sesion}`)
      .expect(200)
    expect(respuesta.body).toMatchObject({ id: secciones[0].id, rol: 'ALUMNO' })
  })
  it.each([
    'profesor@norte.cursus.test',
    'ayudante@norte.cursus.test',
    'director@norte.cursus.test',
    'administrativo.ingenieria@norte.cursus.test',
  ])('otro rol recibe lista vacía: %s', async (correo) => {
    expect(await listar(correo)).toEqual([])
  })
  it('sin sesión responde 401', async () => {
    await request(app.getHttpServer()).get(RUTA).expect(401)
  })
})
