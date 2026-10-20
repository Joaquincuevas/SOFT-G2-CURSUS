import type {
  AlumnoAgregado,
  AlumnoQuitado,
  AlumnosSeccion,
  CursoDetalle,
} from '@cursus/shared'
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
// crea y se borra en cada ejecución (GES-19).
const BD_TEST = `${process.env.POSTGRES_TEST_DB ?? 'cursus_test'}_quitar_alumno`
const PASSWORD = 'contraseña-de-prueba'
const BD_ORIGINAL = process.env.POSTGRES_DB

// Usuarios del seed.
const ADMIN_INGENIERIA = 'administrativo.ingenieria@norte.cursus.test'
const ADMIN_ECONOMIA = 'administrativo.economia@norte.cursus.test'
const ADMIN_SUR = 'administrativo@sur.cursus.test'
const DIRECTOR = 'director@norte.cursus.test'
const ALUMNO = 'alumno@norte.cursus.test'

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
async function peticion(
  correo: string,
  metodo: 'get' | 'post' | 'patch',
  ruta: string,
  estado: number,
  datos?: object,
) {
  const token = await tokenDe(correo)
  const req = request(app.getHttpServer())
    [metodo](ruta)
    .set('Authorization', `Bearer ${token}`)
  return (datos ? req.send(datos) : req).expect(estado)
}

const agregar = async (seccionId: string, datos: object) =>
  (
    await peticion(
      ADMIN_INGENIERIA,
      'post',
      `/api/secciones/${seccionId}/alumnos`,
      201,
      datos,
    )
  ).body as AlumnoAgregado

const quitar = (
  correo: string,
  seccionId: string,
  usuarioId: string,
  estado = 200,
) =>
  peticion(
    correo,
    'patch',
    `/api/secciones/${seccionId}/alumnos/${usuarioId}/quitar`,
    estado,
  )

const lista = async (seccionId: string) =>
  (
    await peticion(
      ADMIN_INGENIERIA,
      'get',
      `/api/secciones/${seccionId}/alumnos`,
      200,
    )
  ).body as AlumnosSeccion

// Sección del seed por código de curso y número.
const seccionDe = async (codigo: string, numero = 1) =>
  (
    await bd.query<{ id: string }[]>(
      `SELECT s.id FROM seccion s JOIN curso c ON c.id = s.curso_id
        WHERE c.codigo = $1 AND s.numero = $2`,
      [codigo, numero],
    )
  )[0].id

async function alumnosEnDetalle(codigo: string, numero = 1) {
  const [{ curso }] = await bd.query<{ curso: string }[]>(
    'SELECT id AS curso FROM curso WHERE codigo = $1',
    [codigo],
  )
  const respuesta = await peticion(
    ADMIN_INGENIERIA,
    'get',
    `/api/cursos/${curso}`,
    200,
  )
  return (respuesta.body as CursoDetalle).secciones.find(
    (s) => s.numero === numero,
  )?.alumnos
}

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

describe('PATCH /api/secciones/:seccionId/alumnos/:usuarioId/quitar', () => {
  it('quita al alumno de la lista y del conteo, y registra fecha y responsable', async () => {
    const seccion = await seccionDe('ICC101')
    const { alumno } = await agregar(seccion, { correo: ALUMNO })
    const otro = await agregar(seccion, {
      correo: 'se.queda@norte.cursus.test',
      nombre: 'Se Queda',
    })
    expect((await lista(seccion)).total).toBe(2)
    expect(await alumnosEnDetalle('ICC101')).toBe(2)

    const antes = new Date()
    const respuesta = await quitar(ADMIN_INGENIERIA, seccion, alumno.id)
    const cuerpo = respuesta.body as AlumnoQuitado
    const [admin] = await bd.query<{ id: string; nombre: string }[]>(
      'SELECT id, nombre FROM usuario WHERE correo = $1',
      [ADMIN_INGENIERIA],
    )
    expect(cuerpo).toEqual({
      alumno: { id: alumno.id, nombre: alumno.nombre, correo: ALUMNO },
      quitadoEn: expect.any(String) as string,
      quitadoPor: admin,
    })
    expect(new Date(cuerpo.quitadoEn).getTime()).toBeGreaterThanOrEqual(
      antes.getTime() - 1000,
    )

    const despues = await lista(seccion)
    expect(despues.alumnos.map((a) => a.id)).toEqual([otro.alumno.id])
    expect(despues.total).toBe(1)
    expect(await alumnosEnDetalle('ICC101')).toBe(1)

    // La inscripción queda archivada con su responsable; no se borra.
    const inscripciones = await bd.query<
      { archived_at: Date | null; archivada_por: string | null }[]
    >(
      'SELECT archived_at, archivada_por FROM inscripcion WHERE seccion_id = $1 AND usuario_id = $2',
      [seccion, alumno.id],
    )
    expect(inscripciones).toEqual([
      { archived_at: expect.any(Date) as Date, archivada_por: admin.id },
    ])
  })

  it('la cuenta del alumno sigue existiendo y puede iniciar sesión', async () => {
    const seccion = await seccionDe('ICC201')
    const correo = 'quitado.entra@norte.cursus.test'
    const { alumno, passwordProvisoria } = await agregar(seccion, {
      correo,
      nombre: 'Quitado Entra',
    })
    await quitar(ADMIN_INGENIERIA, seccion, alumno.id)

    const [usuario] = await bd.query<{ archived_at: Date | null }[]>(
      'SELECT archived_at FROM usuario WHERE id = $1',
      [alumno.id],
    )
    expect(usuario).toEqual({ archived_at: null })
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ correo, password: passwordProvisoria })
      .expect(200)
  })

  it('quitar dos veces responde 404', async () => {
    const seccion = await seccionDe('ICC101', 2)
    const { alumno } = await agregar(seccion, { correo: ALUMNO })
    await quitar(ADMIN_INGENIERIA, seccion, alumno.id)
    const respuesta = await quitar(ADMIN_INGENIERIA, seccion, alumno.id, 404)
    expect(respuesta.body).toMatchObject({
      message: 'El alumno no está inscrito en esta sección',
    })
  })

  it('un alumno que nunca estuvo inscrito responde 404', async () => {
    const [{ id }] = await bd.query<{ id: string }[]>(
      'SELECT id FROM usuario WHERE correo = $1',
      [ALUMNO],
    )
    await quitar(ADMIN_INGENIERIA, await seccionDe('ICC201', 2), id, 404)
  })

  it('se puede volver a inscribir después de quitarlo', async () => {
    const seccion = await seccionDe('ICC201')
    const { alumno } = await agregar(seccion, { correo: ALUMNO })
    await quitar(ADMIN_INGENIERIA, seccion, alumno.id)
    const deNuevo = await agregar(seccion, { correo: ALUMNO })
    expect(deNuevo).toMatchObject({
      alumno: { id: alumno.id },
      cuentaCreada: false,
    })
    expect((await lista(seccion)).alumnos.map((a) => a.id)).toContain(alumno.id)
    // Queda la archivada y una nueva activa.
    const [{ archivadas, activas }] = await bd.query<
      { archivadas: number; activas: number }[]
    >(
      `SELECT count(*) FILTER (WHERE archived_at IS NOT NULL)::int AS archivadas,
              count(*) FILTER (WHERE archived_at IS NULL)::int AS activas
         FROM inscripcion WHERE seccion_id = $1 AND usuario_id = $2`,
      [seccion, alumno.id],
    )
    expect({ archivadas, activas }).toEqual({ archivadas: 1, activas: 1 })
  })

  describe('sin acceso', () => {
    let seccion: string
    let alumnoId: string

    beforeAll(async () => {
      seccion = await seccionDe('ICC201', 2)
      alumnoId = (await agregar(seccion, { correo: ALUMNO })).alumno.id
    })

    // Después de cada caso, el alumno sigue inscrito.
    afterEach(async () => {
      expect((await lista(seccion)).alumnos.map((a) => a.id)).toContain(
        alumnoId,
      )
    })

    it('responde 404 con una sección de otra universidad', async () => {
      await quitar(ADMIN_SUR, seccion, alumnoId, 404)
    })

    it('responde 404 con una sección de otra facultad', async () => {
      await quitar(ADMIN_ECONOMIA, seccion, alumnoId, 404)
    })

    it('el Director recibe 403', async () => {
      await quitar(DIRECTOR, seccion, alumnoId, 403)
    })

    it('responde 400 con un uuid inválido', async () => {
      await quitar(ADMIN_INGENIERIA, 'no-es-uuid', alumnoId, 400)
      await quitar(ADMIN_INGENIERIA, seccion, 'no-es-uuid', 400)
    })
  })
})
