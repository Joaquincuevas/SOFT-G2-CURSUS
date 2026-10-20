import type { DocenteCreado, ProfesorOpcion } from '@cursus/shared'
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
// crea y se borra en cada ejecución (GES-21).
const BD_TEST = `${process.env.POSTGRES_TEST_DB ?? 'cursus_test'}_crear_docente`
const PASSWORD = 'contraseña-de-prueba'
const BD_ORIGINAL = process.env.POSTGRES_DB

// Usuarios del seed.
const ADMIN_INGENIERIA = 'administrativo.ingenieria@norte.cursus.test'
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
async function crear(correo: string, datos: object, estado = 201) {
  const token = await tokenDe(correo)
  return request(app.getHttpServer())
    .post('/api/usuarios')
    .set('Authorization', `Bearer ${token}`)
    .send(datos)
    .expect(estado)
}

const usuariosCon = async (correo: string) =>
  (
    await bd.query<{ cantidad: number }[]>(
      'SELECT count(*)::int AS cantidad FROM usuario WHERE lower(correo) = $1',
      [correo],
    )
  )[0].cantidad

const login = (correo: string, password: string) =>
  request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ correo, password })
    .expect(200)

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

describe('POST /api/usuarios', () => {
  it.each([
    ['PROFESOR', 'nueva.profesora@norte.cursus.test'],
    ['AYUDANTE', 'nuevo.ayudante@norte.cursus.test'],
  ])(
    'crea un %s que entra con la contraseña provisoria',
    async (rol, correo) => {
      const respuesta = await crear(ADMIN_INGENIERIA, {
        nombre: '  Docente Nuevo ',
        correo: `  ${correo.toUpperCase()} `,
        rol,
      })
      expect(respuesta.headers['cache-control']).toBe('no-store')
      const cuerpo = respuesta.body as DocenteCreado
      expect(cuerpo).toEqual({
        usuario: {
          id: expect.any(String) as string,
          nombre: 'Docente Nuevo',
          correo,
          rol,
        },
        passwordProvisoria: expect.stringMatching(/^[A-Z2-9]{16}$/) as string,
      })

      // Con la facultad del administrativo y sin la contraseña en texto plano.
      const [usuario] = await bd.query<
        { facultad: string; password_hash: string }[]
      >(
        `SELECT f.nombre AS facultad, u.password_hash
         FROM usuario u JOIN facultad f ON f.id = u.facultad_id
        WHERE u.id = $1`,
        [cuerpo.usuario.id],
      )
      expect(usuario.facultad).toBe('Facultad de Ingeniería')
      expect(usuario.password_hash).toMatch(/^\$argon2id\$/)
      expect(usuario.password_hash).not.toContain(cuerpo.passwordProvisoria)

      await login(correo, cuerpo.passwordProvisoria)
    },
  )

  it('el profesor creado aparece en GET /api/profesores (GES-12)', async () => {
    const { usuario } = (
      await crear(ADMIN_INGENIERIA, {
        nombre: 'Profesor Para Asignar',
        correo: 'para.asignar@norte.cursus.test',
        rol: 'PROFESOR',
      })
    ).body as DocenteCreado
    const token = await tokenDe(ADMIN_INGENIERIA)
    const respuesta = await request(app.getHttpServer())
      .get('/api/profesores')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(respuesta.body as ProfesorOpcion[]).toContainEqual(
      expect.objectContaining({
        id: usuario.id,
        nombre: 'Profesor Para Asignar',
      }),
    )
  })

  it('queda con la facultad del administrativo que lo crea', async () => {
    const { usuario } = (
      await crear(ADMIN_ECONOMIA, {
        nombre: 'Ayudante Economía',
        correo: 'ayudante.eco@norte.cursus.test',
        rol: 'AYUDANTE',
      })
    ).body as DocenteCreado
    const [{ facultad }] = await bd.query<{ facultad: string }[]>(
      `SELECT f.nombre AS facultad FROM usuario u
         JOIN facultad f ON f.id = u.facultad_id WHERE u.id = $1`,
      [usuario.id],
    )
    expect(facultad).toBe('Facultad de Economía y Negocios')
  })

  it('rechaza un correo de otro dominio', async () => {
    const respuesta = await crear(
      ADMIN_INGENIERIA,
      { nombre: 'Externo', correo: 'externo@gmail.com', rol: 'PROFESOR' },
      400,
    )
    expect(respuesta.body).toMatchObject({
      message: 'El correo debe ser @norte.cursus.test',
    })
    expect(await usuariosCon('externo@gmail.com')).toBe(0)
  })

  it.each(['ALUMNO', 'ADMINISTRATIVO', 'DIRECTOR', 'profesor', undefined])(
    'rechaza el rol %s',
    async (rol) => {
      const correo = `rol.${String(rol).toLowerCase()}@norte.cursus.test`
      await crear(
        ADMIN_INGENIERIA,
        { nombre: 'Rol Inválido', correo, rol },
        400,
      )
      expect(await usuariosCon(correo)).toBe(0)
    },
  )

  it.each([
    ['el mismo correo', 'repetido@norte.cursus.test'],
    ['con mayúsculas y espacios', '  REPETIDO@Norte.Cursus.Test '],
    ['de una cuenta del seed con otro rol', PROFESOR],
  ])('responde 409 con %s', async (_caso, correo) => {
    if (_caso === 'el mismo correo') {
      await crear(ADMIN_INGENIERIA, {
        nombre: 'Primero',
        correo,
        rol: 'AYUDANTE',
      })
    }
    const respuesta = await crear(
      ADMIN_INGENIERIA,
      { nombre: 'Segundo', correo, rol: 'PROFESOR' },
      409,
    )
    expect(respuesta.body).toMatchObject({
      message: 'Ya existe una cuenta con ese correo',
    })
    expect(await usuariosCon(correo.trim().toLowerCase())).toBe(1)
    // No modifica la cuenta existente.
    const [{ nombre }] = await bd.query<{ nombre: string }[]>(
      'SELECT nombre FROM usuario WHERE lower(correo) = $1',
      [correo.trim().toLowerCase()],
    )
    expect(nombre).not.toBe('Segundo')
  })

  it.each([
    ['sin nombre', { correo: 'a@norte.cursus.test', rol: 'PROFESOR' }],
    [
      'un nombre en blanco',
      { nombre: '   ', correo: 'b@norte.cursus.test', rol: 'PROFESOR' },
    ],
    [
      'un nombre de más de 120',
      {
        nombre: 'x'.repeat(121),
        correo: 'c@norte.cursus.test',
        rol: 'PROFESOR',
      },
    ],
    [
      'un correo inválido',
      { nombre: 'X', correo: 'no-es-correo', rol: 'PROFESOR' },
    ],
  ])('responde 400 con %s', async (_caso, datos) => {
    await crear(ADMIN_INGENIERIA, datos, 400)
  })

  it.each([
    ['el Director', DIRECTOR, 'por.director@norte.cursus.test'],
    ['un Profesor', PROFESOR, 'por.profesor@norte.cursus.test'],
  ])('%s recibe 403 y no se crea nada', async (_rol, correo, nuevo) => {
    await crear(
      correo,
      { nombre: 'Prohibido', correo: nuevo, rol: 'AYUDANTE' },
      403,
    )
    expect(await usuariosCon(nuevo)).toBe(0)
  })

  it('el administrativo de otra universidad crea en la suya', async () => {
    const respuesta = await crear(
      ADMIN_SUR,
      {
        nombre: 'Del Norte',
        correo: 'del.norte@norte.cursus.test',
        rol: 'PROFESOR',
      },
      400,
    )
    expect(respuesta.body).toMatchObject({
      message: 'El correo debe ser @sur.cursus.test',
    })
  })
})
