import type { AlumnoAgregado, CursoDetalle } from '@cursus/shared'
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
const BD_TEST = `${process.env.POSTGRES_TEST_DB ?? 'cursus_test'}_agregar_alumno`
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
async function agregar(
  correo: string,
  seccionId: string,
  datos: object,
  estado = 201,
) {
  const token = await tokenDe(correo)
  return request(app.getHttpServer())
    .post(`/api/secciones/${seccionId}/alumnos`)
    .set('Authorization', `Bearer ${token}`)
    .send(datos)
    .expect(estado)
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

describe('POST /api/secciones/:id/alumnos', () => {
  it('crea la cuenta de un alumno nuevo, que entra con la contraseña provisoria', async () => {
    const seccion = await seccionDe('ICC101')
    const respuesta = await agregar(ADMIN_INGENIERIA, seccion, {
      correo: '  Nuevo.Alumno@NORTE.cursus.test ',
      nombre: '  Ana Pérez ',
    })
    expect(respuesta.headers['cache-control']).toBe('no-store')
    const cuerpo = respuesta.body as AlumnoAgregado
    expect(cuerpo).toEqual({
      alumno: {
        id: expect.any(String) as string,
        nombre: 'Ana Pérez',
        correo: 'nuevo.alumno@norte.cursus.test',
      },
      cuentaCreada: true,
      passwordProvisoria: expect.stringMatching(/^[A-Z2-9]{16}$/) as string,
    })

    // Alumno de la facultad del curso, sin la contraseña en texto plano y
    // marcada como provisoria (PER-03).
    const [usuario] = await bd.query<
      {
        rol: string
        facultad: string
        password_hash: string
        credencial_provisoria: boolean
      }[]
    >(
      `SELECT u.rol, f.nombre AS facultad, u.password_hash, u.credencial_provisoria
         FROM usuario u JOIN facultad f ON f.id = u.facultad_id
        WHERE u.id = $1`,
      [cuerpo.alumno.id],
    )
    expect(usuario).toMatchObject({
      rol: 'ALUMNO',
      facultad: 'Facultad de Ingeniería',
      credencial_provisoria: true,
    })
    expect(usuario.password_hash).toMatch(/^\$argon2id\$/)
    expect(usuario.password_hash).not.toContain(cuerpo.passwordProvisoria)

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        correo: 'nuevo.alumno@norte.cursus.test',
        password: cuerpo.passwordProvisoria,
      })
      .expect(200)
  })

  it('vincula a un alumno que ya tiene cuenta sin crear otra', async () => {
    const respuesta = await agregar(
      ADMIN_INGENIERIA,
      await seccionDe('ICC201'),
      {
        correo: ALUMNO,
      },
    )
    const cuerpo = respuesta.body as AlumnoAgregado
    expect(cuerpo).toMatchObject({
      alumno: { correo: ALUMNO },
      cuentaCreada: false,
    })
    expect(cuerpo).not.toHaveProperty('passwordProvisoria')
    expect(await usuariosCon(ALUMNO)).toBe(1)
  })

  it('el conteo de alumnos del detalle sube', async () => {
    const antes = await alumnosDe('ICC101', 2)
    await agregar(ADMIN_INGENIERIA, await seccionDe('ICC101', 2), {
      correo: ALUMNO,
    })
    expect(await alumnosDe('ICC101', 2)).toBe((antes ?? 0) + 1)
  })

  it('no inscribe dos veces al mismo alumno en la sección', async () => {
    const seccion = await seccionDe('ICC201', 2)
    await agregar(ADMIN_INGENIERIA, seccion, { correo: ALUMNO })
    const respuesta = await agregar(
      ADMIN_INGENIERIA,
      seccion,
      { correo: ALUMNO },
      409,
    )
    expect(respuesta.body).toMatchObject({
      message: 'El alumno ya está inscrito en esta sección',
    })
  })

  it('rechaza un correo de otro dominio', async () => {
    const respuesta = await agregar(
      ADMIN_INGENIERIA,
      await seccionDe('ICC101'),
      { correo: 'alguien@gmail.com', nombre: 'Alguien' },
      400,
    )
    expect(respuesta.body).toMatchObject({
      message: 'El correo debe ser @norte.cursus.test',
    })
    expect(await usuariosCon('alguien@gmail.com')).toBe(0)
  })

  it('rechaza el correo de un profesor', async () => {
    const respuesta = await agregar(
      ADMIN_INGENIERIA,
      await seccionDe('ICC101'),
      { correo: 'profesor@norte.cursus.test' },
      409,
    )
    expect(respuesta.body).toMatchObject({
      message: 'Ese correo pertenece a un profesor',
    })
  })

  it('pide el nombre si hay que crear la cuenta', async () => {
    const correo = 'sin.nombre@norte.cursus.test'
    for (const datos of [{ correo }, { correo, nombre: '   ' }]) {
      const respuesta = await agregar(
        ADMIN_INGENIERIA,
        await seccionDe('ICC101'),
        datos,
        400,
      )
      expect(respuesta.body).toMatchObject({
        message: 'Ingresa el nombre del alumno',
      })
    }
    expect(await usuariosCon(correo)).toBe(0)
  })

  it('responde 400 con un correo inválido', async () => {
    await agregar(
      ADMIN_INGENIERIA,
      await seccionDe('ICC101'),
      { correo: 'no-es-correo' },
      400,
    )
  })

  it('responde 404 con una sección de otra universidad', async () => {
    await agregar(
      ADMIN_SUR,
      await seccionDe('ICC101'),
      { correo: 'alumno@sur.cursus.test' },
      404,
    )
  })

  it('responde 404 con una sección de otra facultad', async () => {
    await agregar(
      ADMIN_ECONOMIA,
      await seccionDe('ICC101'),
      { correo: ALUMNO },
      404,
    )
  })

  it('responde 404 con una sección archivada', async () => {
    const seccion = await seccionDe('ICO101')
    await bd.query('UPDATE seccion SET archived_at = now() WHERE id = $1', [
      seccion,
    ])
    await agregar(ADMIN_ECONOMIA, seccion, { correo: ALUMNO }, 404)
  })

  it('responde 400 con un id que no es uuid', async () => {
    await agregar(ADMIN_INGENIERIA, 'no-es-uuid', { correo: ALUMNO }, 400)
  })

  it('el Director recibe 403 y no inscribe a nadie', async () => {
    const seccion = await seccionDe('ICC101')
    const [{ antes }] = await bd.query<{ antes: number }[]>(
      'SELECT count(*)::int AS antes FROM inscripcion WHERE seccion_id = $1',
      [seccion],
    )
    await agregar(DIRECTOR, seccion, { correo: ALUMNO }, 403)
    const [{ despues }] = await bd.query<{ despues: number }[]>(
      'SELECT count(*)::int AS despues FROM inscripcion WHERE seccion_id = $1',
      [seccion],
    )
    expect(despues).toBe(antes)
  })
})
