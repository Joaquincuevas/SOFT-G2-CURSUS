import type { UsuarioSesion } from '@cursus/shared'
import type { INestApplication } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { DataSource } from 'typeorm'
import { AppModule } from '../../src/app.module.js'
import type { RespuestaLogin } from '../../src/auth/auth.controller.js'
import type { PayloadJwt } from '../../src/auth/auth.service.js'
import { configurarApp } from '../../src/config/configurar-app.js'
import { opcionesDataSource } from '../../src/database/data-source.js'
import {
  ejecutarSeed,
  PERIODO,
  UNIVERSIDADES,
} from '../../src/database/seed.js'

// Base propia con el seed cargado, que se crea y se borra en cada ejecución.
const BD_TEST = `${process.env.POSTGRES_TEST_DB ?? 'cursus_test'}_auth`
const PASSWORD = 'contraseña-de-prueba'
const BD_ORIGINAL = process.env.POSTGRES_DB

let admin: DataSource
let bd: DataSource
let app: INestApplication<App>

const login = (correo: string, password: string) =>
  request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ correo, password })

// Inicia sesión con la contraseña del seed y devuelve el JWT.
async function tokenDe(correo: string): Promise<string> {
  const respuesta = await login(correo, PASSWORD).expect(200)
  return (respuesta.body as RespuestaLogin).accessToken
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

describe('seed y login', () => {
  it('cada correo del seed usa el dominio de su universidad', async () => {
    const distintos = await bd.query<{ correo: string }[]>(
      `SELECT u.correo FROM usuario u
       JOIN universidad un ON un.id = u.universidad_id
       WHERE split_part(lower(u.correo), '@', 2) <> un.dominio_correo`,
    )
    expect(distintos).toEqual([])
  })
})

describe('POST /api/auth/login', () => {
  // Todos los usuarios del seed, de las dos universidades (incluidos los directores).
  const usuarios = UNIVERSIDADES.flatMap((u) =>
    u.usuarios.map((usuario) => ({
      correo: `${usuario.usuario}@${u.dominio}`,
      rol: usuario.rol,
    })),
  )

  it.each(usuarios)(
    '$correo ($rol) entra y recibe un JWT con su rol y universidad',
    async ({ correo, rol }) => {
      const token = await tokenDe(correo)

      const [esperado] = await bd.query<
        { id: string; universidad_id: string }[]
      >('SELECT id, universidad_id FROM usuario WHERE correo = $1', [correo])
      const payload = new JwtService().decode<
        PayloadJwt & { exp: number; iat: number }
      >(token)
      expect(payload).toMatchObject({
        sub: esperado.id,
        rol,
        universidad_id: esperado.universidad_id,
      })
      // JWT de corta duración: 15 minutos por defecto.
      expect(payload.exp - payload.iat).toBe(15 * 60)
    },
  )

  it('no distingue mayúsculas en el correo', async () => {
    expect(await tokenDe('DIRECTOR@Norte.Cursus.Test')).toBeTruthy()
  })

  it.each([
    ['contraseña incorrecta', 'alumno@norte.cursus.test', 'otra-contraseña'],
    ['correo inexistente', 'nadie@norte.cursus.test', PASSWORD],
    // administrativo.ingenieria solo existe en la Universidad Demo Norte.
    [
      'dominio incorrecto',
      'administrativo.ingenieria@sur.cursus.test',
      PASSWORD,
    ],
  ])(
    '%s: responde el mismo error sin emitir tokens ni crear una sesión',
    async (_caso, correo, password) => {
      const contarSesiones = () =>
        bd.query<{ sesiones: number; refreshTokens: number }[]>(
          `SELECT (SELECT count(*)::int FROM sesion_auth) AS sesiones,
                  (SELECT count(*)::int FROM refresh_token) AS "refreshTokens"`,
        )
      const antes = await contarSesiones()

      const respuesta = await login(correo, password).expect(401)

      expect(respuesta.body).toEqual({
        statusCode: 401,
        message: 'Credenciales inválidas',
        error: 'Unauthorized',
      })
      expect(respuesta.headers['set-cookie']).toBeUndefined()
      expect(await contarSesiones()).toEqual(antes)
    },
  )

  it('responde 400 si falta el correo o la contraseña', async () => {
    await login('', PASSWORD).expect(400)
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ correo: 'alumno@norte.cursus.test' })
      .expect(400)
  })

  it('el token permite entrar a una ruta protegida', async () => {
    const token = await tokenDe('profesor@sur.cursus.test')
    await request(app.getHttpServer())
      .get('/api')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
  })
})

describe('GET /api/auth/yo', () => {
  const yo = (token?: string) => {
    const peticion = request(app.getHttpServer()).get('/api/auth/yo')
    return token ? peticion.set('Authorization', `Bearer ${token}`) : peticion
  }

  // Un usuario de cada rol, y el de Salud Sur para cubrir la otra universidad.
  const casos: (Omit<
    UsuarioSesion,
    'id' | 'universidadId' | 'periodoActivo' | 'debeCambiarPassword'
  > & {
    correo: string
  })[] = [
    {
      correo: 'director@norte.cursus.test',
      nombre: 'Director Norte',
      rol: 'DIRECTOR',
      universidadNombre: 'Directorio',
      facultadNombre: null,
    },
    {
      correo: 'administrativo.ingenieria@norte.cursus.test',
      nombre: 'Administrativo Ingeniería Norte',
      rol: 'ADMINISTRATIVO',
      universidadNombre: 'Universidad Demo Norte',
      facultadNombre: 'Facultad de Ingeniería',
    },
    {
      correo: 'profesor@norte.cursus.test',
      nombre: 'Profesor Norte',
      rol: 'PROFESOR',
      universidadNombre: 'Universidad Demo Norte',
      facultadNombre: 'Facultad de Ingeniería',
    },
    {
      correo: 'ayudante@norte.cursus.test',
      nombre: 'Ayudante Norte',
      rol: 'AYUDANTE',
      universidadNombre: 'Universidad Demo Norte',
      facultadNombre: 'Facultad de Ingeniería',
    },
    {
      correo: 'alumno@sur.cursus.test',
      nombre: 'Alumno Sur',
      rol: 'ALUMNO',
      universidadNombre: 'Universidad Demo Sur',
      facultadNombre: 'Facultad de Ciencias de la Salud',
    },
  ]

  it.each(casos)(
    '$correo ($rol) recibe sus datos y el período activo',
    async ({ correo, ...esperado }) => {
      const [usuario] = await bd.query<
        { id: string; universidad_id: string }[]
      >('SELECT id, universidad_id FROM usuario WHERE correo = $1', [correo])
      const [periodo] = await bd.query<{ id: string }[]>(
        'SELECT id FROM periodo WHERE universidad_id = $1 AND activo',
        [usuario.universidad_id],
      )

      const respuesta = await yo(await tokenDe(correo)).expect(200)

      expect(respuesta.body).toEqual({
        id: usuario.id,
        universidadId: usuario.universidad_id,
        correo,
        ...esperado,
        // Las cuentas del seed no tienen contraseña provisoria (PER-03).
        debeCambiarPassword: false,
        periodoActivo: {
          id: periodo.id,
          anio: PERIODO.anio,
          semestre: PERIODO.semestre,
        },
      } satisfies UsuarioSesion)
    },
  )

  it('periodoActivo es null si la universidad no tiene uno activo', async () => {
    const marcarActivo = (activo: boolean) =>
      bd.query(
        `UPDATE periodo SET activo = $1 WHERE universidad_id =
           (SELECT id FROM universidad WHERE dominio_correo = 'sur.cursus.test')`,
        [activo],
      )
    const token = await tokenDe('profesor@sur.cursus.test')
    await marcarActivo(false)
    try {
      const respuesta = await yo(token).expect(200)
      expect((respuesta.body as UsuarioSesion).periodoActivo).toBeNull()
    } finally {
      await marcarActivo(true)
    }
  })

  it('responde 401 sin token', async () => {
    await yo().expect(401)
  })

  it('responde 401 si el usuario del token ya no existe', async () => {
    const token = new JwtService({ secret: process.env.JWT_SECRET }).sign({
      sub: '00000000-0000-0000-0000-000000000000',
      rol: 'ALUMNO',
      universidad_id: '00000000-0000-0000-0000-000000000000',
    } satisfies PayloadJwt)
    await yo(token).expect(401)
  })
})
