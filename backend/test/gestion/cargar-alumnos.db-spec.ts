import type { ResultadoCargaAlumnos, CursoDetalle } from '@cursus/shared'
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
// crea y se borra en cada ejecución (GES-15).
const BD_TEST = `${process.env.POSTGRES_TEST_DB ?? 'cursus_test'}_carga_csv`
const PASSWORD = 'contraseña-de-prueba'
const BD_ORIGINAL = process.env.POSTGRES_DB

// Usuarios del seed.
const ADMIN_INGENIERIA = 'administrativo.ingenieria@norte.cursus.test'
const ADMIN_ECONOMIA = 'administrativo.economia@norte.cursus.test'
const ADMIN_SUR = 'administrativo@sur.cursus.test'

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
async function cargar(
  seccionId: string,
  csv: string,
  correo = ADMIN_INGENIERIA,
) {
  const token = await tokenDe(correo)
  return request(app.getHttpServer())
    .post(`/api/secciones/${seccionId}/alumnos/csv`)
    .set('Authorization', `Bearer ${token}`)
    .send({ csv })
}

// Sección del seed por código de curso y número.
const seccionDe = async (codigo: string, numero = 1) =>
  (
    await bd.query<{ id: string }[]>(
      `SELECT s.id FROM seccion s JOIN curso c ON c.id = s.curso_id
        WHERE c.codigo = $1 AND s.numero = $2`,
      [codigo, numero],
    )
  )[0].id

async function alumnosDe(codigo: string, numero = 1) {
  const [{ curso }] = await bd.query<{ curso: string }[]>(
    'SELECT id AS curso FROM curso WHERE codigo = $1',
    [codigo],
  )
  const token = await tokenDe(ADMIN_INGENIERIA)
  const respuesta = await request(app.getHttpServer())
    .get(`/api/cursos/${curso}`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200)
  return (respuesta.body as CursoDetalle).secciones.find(
    (s) => s.numero === numero,
  )?.alumnos
}

const usuariosCon = async (correo: string) =>
  (
    await bd.query<{ cantidad: number }[]>(
      'SELECT count(*)::int AS cantidad FROM usuario WHERE lower(correo) = $1',
      [correo],
    )
  )[0].cantidad

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

describe('GES-16: carga CSV de alumnos', () => {
  it('crea y vincula alumnos, normaliza datos y devuelve el total y la contraseña solo para cuentas nuevas', async () => {
    const seccion = await seccionDe('ICC101')
    const respuesta = await cargar(
      seccion,
      '\uFEFFcorreo,nombre\r\n  CSV.NUEVO@NORTE.cursus.test  ,"Pérez, Ana"\r\nalumno@norte.cursus.test,\r\n',
    )
    expect(respuesta.status).toBe(200)
    expect(respuesta.headers['cache-control']).toBe('no-store')
    const resultado = respuesta.body as ResultadoCargaAlumnos
    expect(resultado).toMatchObject({ total: 2, cargados: 2, errores: 0 })
    const [nuevo, existente] = resultado.filas
    expect(nuevo).toMatchObject({
      fila: 2,
      correo: 'csv.nuevo@norte.cursus.test',
      estado: 'cargado',
      cuentaCreada: true,
      alumno: { nombre: 'Pérez, Ana' },
    })
    expect(existente).toMatchObject({ estado: 'cargado', cuentaCreada: false })
    expect(existente).not.toHaveProperty('passwordProvisoria')
    if (nuevo.estado !== 'cargado') throw new Error('Se esperaba alumno creado')
    expect(nuevo.passwordProvisoria).toBeTruthy()
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ correo: nuevo.correo, password: nuevo.passwordProvisoria })
      .expect(200)
    expect(await usuariosCon(nuevo.correo)).toBe(1)
    expect(await alumnosDe('ICC101')).toBe(2)
  })

  it('continúa después de filas inválidas, duplicadas y de dominio o rol incorrecto', async () => {
    const seccion = await seccionDe('ICC101')
    const csv =
      'correo,nombre\nalumno@norte.cursus.test,\ncorreo-invalido,Ana\nprofesor@norte.cursus.test,Profesor\nexterno@otro.cl,Ana\nsin.nombre@norte.cursus.test,\nvalido.csv@norte.cursus.test,Nombre válido\nvalido.csv@norte.cursus.test,Repetido\ncolumnas@norte.cursus.test,Ana,extra\nlargo@norte.cursus.test,' +
      'N'.repeat(121)
    const respuesta = await cargar(seccion, csv)
    expect(respuesta.status).toBe(200)
    const resultado = respuesta.body as ResultadoCargaAlumnos
    expect(resultado).toMatchObject({ total: 9, cargados: 1, errores: 8 })
    expect(resultado.filas[0]).toMatchObject({
      estado: 'error',
      mensaje: 'El alumno ya está inscrito en esta sección',
    })
    expect(resultado.filas[4]).toMatchObject({
      estado: 'error',
      mensaje: 'Ingresa el nombre del alumno',
    })
    expect(await usuariosCon('sin.nombre@norte.cursus.test')).toBe(0)
    expect(await alumnosDe('ICC101')).toBe(3)
  })

  it('no reactiva cuentas archivadas y permite inscribir en otra sección una cuenta existente', async () => {
    await bd.query(
      "UPDATE usuario SET archived_at = now() WHERE correo = 'csv.nuevo@norte.cursus.test'",
    )
    const respuesta = await cargar(
      await seccionDe('ICC101', 2),
      'correo,nombre\ncsv.nuevo@norte.cursus.test,Ana\nalumno@norte.cursus.test,Ignorado',
    )
    expect(respuesta.status).toBe(200)
    expect(respuesta.body).toMatchObject({ cargados: 1, errores: 1 })
    const resultado = respuesta.body as ResultadoCargaAlumnos
    expect(resultado.filas[0]).toMatchObject({
      estado: 'error',
      mensaje: 'La cuenta de ese alumno está archivada',
    })
    expect(resultado.filas[1]).toMatchObject({
      estado: 'cargado',
      cuentaCreada: false,
      alumno: { nombre: 'Alumno Norte' },
    })
  })

  it.each([
    'correo;nombre\nno.crear@norte.cursus.test;Ana',
    'correo,nombre\nno.crear@norte.cursus.test,Ana\n"sin cerrar',
    'correo,nombre\n',
    '',
  ])('estructura inválida no carga nada: %j', async (csv) => {
    expect((await cargar(await seccionDe('ICC101'), csv)).status).toBe(400)
    expect(await usuariosCon('no.crear@norte.cursus.test')).toBe(0)
  })

  it('rechaza el archivo entero antes de escribir si supera filas o bytes', async () => {
    const seccion = await seccionDe('ICC101')
    expect(
      (
        await cargar(
          seccion,
          'correo,nombre\n' + 'no.crear@norte.cursus.test,Ana\n'.repeat(101),
        )
      ).status,
    ).toBe(400)
    expect(
      (await cargar(seccion, 'correo,nombre\n' + 'ñ'.repeat(25000))).status,
    ).toBe(400)
    expect(await usuariosCon('no.crear@norte.cursus.test')).toBe(0)
  })

  it('no carga en secciones de otra facultad/universidad ni archivadas o inexistentes', async () => {
    const csv = 'correo,nombre\nno.ambito@norte.cursus.test,Ana'
    const seccion = await seccionDe('ICC101')
    expect((await cargar(seccion, csv, ADMIN_ECONOMIA)).status).toBe(404)
    expect((await cargar(seccion, csv, ADMIN_SUR)).status).toBe(404)
    expect(
      (await cargar('00000000-0000-4000-8000-000000000001', csv)).status,
    ).toBe(404)
    const archivada = await seccionDe('ICO101')
    await bd.query('UPDATE seccion SET archived_at = now() WHERE id = $1', [
      archivada,
    ])
    expect((await cargar(archivada, csv, ADMIN_ECONOMIA)).status).toBe(404)
    expect(await usuariosCon('no.ambito@norte.cursus.test')).toBe(0)
  })

  it.each(['director', 'profesor', 'ayudante', 'alumno'])(
    '%s no puede cargar',
    async (rol) => {
      expect(
        (
          await cargar(
            await seccionDe('ICC101'),
            'correo,nombre\nalumno@norte.cursus.test,',
            `${rol}@norte.cursus.test`,
          )
        ).status,
      ).toBe(403)
    },
  )

  it('exige sesión, UUID y body válido', async () => {
    const seccion = await seccionDe('ICC101')
    await request(app.getHttpServer())
      .post(`/api/secciones/${seccion}/alumnos/csv`)
      .send({ csv: '' })
      .expect(401)
    expect((await cargar('abc', 'correo,nombre\na@u.cl,Ana')).status).toBe(400)
    const token = await tokenDe(ADMIN_INGENIERIA)
    for (const body of [
      { csv: 123 },
      {},
      { csv: 'correo,nombre\na@u.cl,Ana', universidadId: 'falsa' },
    ]) {
      await request(app.getHttpServer())
        .post(`/api/secciones/${seccion}/alumnos/csv`)
        .set('Authorization', `Bearer ${token}`)
        .send(body)
        .expect(400)
    }
  })

  it('dos cargas simultáneas no duplican cuentas ni inscripciones', async () => {
    const seccion = await seccionDe('ICC101', 2)
    const csv = 'correo,nombre\nconcurrente.csv@norte.cursus.test,Concurrente'
    const respuestas = await Promise.all([
      cargar(seccion, csv),
      cargar(seccion, csv),
    ])
    expect(respuestas.map((r) => r.status)).toEqual([200, 200])
    expect(
      respuestas.reduce(
        (suma, r) => suma + (r.body as ResultadoCargaAlumnos).cargados,
        0,
      ),
    ).toBe(1)
    expect(await usuariosCon('concurrente.csv@norte.cursus.test')).toBe(1)
    const [{ cantidad }] = await bd.query<{ cantidad: number }[]>(
      `SELECT count(*)::int AS cantidad FROM inscripcion i JOIN usuario u ON u.id = i.usuario_id WHERE i.seccion_id = $1 AND u.correo = $2`,
      [seccion, 'concurrente.csv@norte.cursus.test'],
    )
    expect(cantidad).toBe(1)
  })
})
