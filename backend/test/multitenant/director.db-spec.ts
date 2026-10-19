import {
  Controller,
  Get,
  HttpCode,
  Inject,
  type INestApplication,
  Post,
} from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { DataSource } from 'typeorm'
import { AppModule } from '../../src/app.module.js'
import type { RespuestaLogin } from '../../src/auth/auth.controller.js'
import { Puede, SoloSesion } from '../../src/auth/permisos.decorator.js'
import { UniversidadActual } from '../../src/auth/universidad-actual.decorator.js'
import { configurarApp } from '../../src/config/configurar-app.js'
import {
  BaseDeDatos,
  type ContextoUniversidad,
} from '../../src/database/base-de-datos.service.js'
import { opcionesDataSource } from '../../src/database/data-source.js'
import { ejecutarSeed, UNIVERSIDADES } from '../../src/database/seed.js'

interface Facultad {
  id: string
  nombre: string
  universidad_id: string
}

// Rutas que solo existen en este test (MT-03, ADR 0001).
@Controller('prueba')
class DirectorPruebaController {
  constructor(@Inject(BaseDeDatos) private readonly bd: BaseDeDatos) {}

  // Vista consolidada: las facultades de todas las universidades.
  @Puede('read', 'Facultad')
  @Get('facultades-todas')
  listarTodas(@UniversidadActual() contexto: ContextoUniversidad) {
    return this.bd.consultarEnTodasLasUniversidades<Facultad>(
      contexto,
      `SELECT id, nombre, universidad_id FROM facultad ORDER BY id`,
    )
  }

  // Una escritura dentro de la consulta consolidada: la transacción READ ONLY
  // la rechaza.
  @Puede('read', 'Facultad')
  @Post('facultades-todas/renombrar')
  @HttpCode(200)
  renombrarTodas(@UniversidadActual() contexto: ContextoUniversidad) {
    return this.bd.consultarEnTodasLasUniversidades(
      contexto,
      `UPDATE facultad SET nombre = nombre || ' (renombrada)'`,
    )
  }

  // Crea una facultad en la universidad de la sesión. Usa @SoloSesion() y no
  // @Puede('create', ...) a propósito: así se prueba que RLS frena al
  // Director aunque la API no lo hiciera. Con @Puede, la API ya le responde
  // 403 (permisos.e2e-spec.ts).
  @SoloSesion()
  @Post('facultades')
  crear(@UniversidadActual() contexto: ContextoUniversidad) {
    return this.bd.consultarEnUniversidad(
      contexto,
      `INSERT INTO facultad (universidad_id, nombre)
       VALUES ($1, 'Facultad de prueba ' || gen_random_uuid())
       RETURNING id`,
    )
  }
}

// Base propia con el seed cargado, que se crea y se borra en cada ejecución.
const BD_TEST = `${process.env.POSTGRES_TEST_DB ?? 'cursus_test'}_director`
const PASSWORD = 'contraseña-de-prueba'
const BD_ORIGINAL = process.env.POSTGRES_DB

let admin: DataSource
let bd: DataSource
let app: INestApplication<App>

async function tokenDe(correo: string): Promise<string> {
  const respuesta = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ correo, password: PASSWORD })
    .expect(200)
  return (respuesta.body as RespuestaLogin).accessToken
}

const pedir = (metodo: 'get' | 'post', ruta: string, token: string) =>
  request(app.getHttpServer())
    [metodo](ruta)
    .set('Authorization', `Bearer ${token}`)

const todasLasFacultades = () =>
  bd.query<Facultad[]>(
    'SELECT id, nombre, universidad_id FROM facultad ORDER BY id',
  )

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
    controllers: [DirectorPruebaController],
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

describe.each(UNIVERSIDADES.map((u) => u.dominio))(
  'Director de %s',
  (dominio) => {
    let token: string

    beforeAll(async () => {
      token = await tokenDe(`director@${dominio}`)
    })

    it('lee las facultades de todas las universidades', async () => {
      const respuesta = await pedir(
        'get',
        '/api/prueba/facultades-todas',
        token,
      ).expect(200)

      const facultades = respuesta.body as Facultad[]
      expect(facultades).toEqual(await todasLasFacultades())
      expect(new Set(facultades.map((f) => f.universidad_id)).size).toBe(
        UNIVERSIDADES.length,
      )
    })

    it('no puede escribir en la consulta consolidada (READ ONLY)', async () => {
      const antes = await todasLasFacultades()
      await pedir(
        'post',
        '/api/prueba/facultades-todas/renombrar',
        token,
      ).expect(500)
      expect(await todasLasFacultades()).toEqual(antes)
    })

    it('RLS no le deja crear registros en su universidad', async () => {
      const antes = await todasLasFacultades()
      await pedir('post', '/api/prueba/facultades', token).expect(500)
      expect(await todasLasFacultades()).toEqual(antes)
    })

    it('/api/auth/yo sigue mostrando su universidad como "Directorio"', async () => {
      const respuesta = await pedir('get', '/api/auth/yo', token).expect(200)
      expect(respuesta.body).toMatchObject({
        rol: 'DIRECTOR',
        universidadNombre: 'Directorio',
      })
    })
  },
)

describe('otros roles', () => {
  const casos = UNIVERSIDADES.flatMap((universidad) =>
    universidad.usuarios
      .filter((usuario) => usuario.rol !== 'DIRECTOR')
      .map((usuario) => ({
        correo: `${usuario.usuario}@${universidad.dominio}`,
        rol: usuario.rol,
      })),
  )

  it.each(casos)(
    '$correo ($rol) recibe 403 en la consulta consolidada',
    async ({ correo }) => {
      await pedir(
        'get',
        '/api/prueba/facultades-todas',
        await tokenDe(correo),
      ).expect(403)
    },
  )

  it('el Administrativo sí crea en su universidad (la ruta de prueba funciona)', async () => {
    const correo = `administrativo.ingenieria@${UNIVERSIDADES[0].dominio}`
    await pedir('post', '/api/prueba/facultades', await tokenDe(correo)).expect(
      201,
    )
  })
})
