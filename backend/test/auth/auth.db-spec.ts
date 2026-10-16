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
import { ejecutarSeed, UNIVERSIDADES } from '../../src/database/seed.js'

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

  it('responde 401 con una contraseña incorrecta', async () => {
    await login('alumno@norte.cursus.test', 'otra-contraseña').expect(401)
  })

  it('responde 401 con un correo que no existe', async () => {
    await login('nadie@norte.cursus.test', PASSWORD).expect(401)
  })

  it('responde 401 si el dominio no es el de la universidad del usuario', async () => {
    // administrativo.ingenieria solo existe en la Universidad Demo Norte.
    await login('administrativo.ingenieria@sur.cursus.test', PASSWORD).expect(
      401,
    )
  })

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
