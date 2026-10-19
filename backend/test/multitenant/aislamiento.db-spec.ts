import { randomUUID } from 'node:crypto'
import {
  Controller,
  Get,
  Inject,
  type INestApplication,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { DataSource } from 'typeorm'
import { AppModule } from '../../src/app.module.js'
import type { RespuestaLogin } from '../../src/auth/auth.controller.js'
import type { PayloadJwt } from '../../src/auth/auth.service.js'
import { Puede } from '../../src/auth/permisos.decorator.js'
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

// Rutas que solo existen en este test: leen facultades con el mecanismo de
// filtro por universidad, como lo hará cualquier endpoint institucional.
@Controller('prueba')
class FacultadesPruebaController {
  constructor(@Inject(BaseDeDatos) private readonly bd: BaseDeDatos) {}

  @Puede('read', 'Facultad')
  @Get('facultades')
  listar(@UniversidadActual() contexto: ContextoUniversidad) {
    return this.bd.consultarEnUniversidad<Facultad>(
      contexto,
      `SELECT id, nombre, universidad_id FROM facultad
        WHERE universidad_id = $1 ORDER BY nombre`,
    )
  }

  // Usa $1 pero no filtra por universidad: pasa el chequeo de la consulta y
  // solo RLS (MT-02) la aísla.
  @Puede('read', 'Facultad')
  @Get('facultades-sin-filtro')
  listarSinFiltro(@UniversidadActual() contexto: ContextoUniversidad) {
    return this.bd.consultarEnUniversidad<Facultad>(
      contexto,
      `SELECT id, nombre, universidad_id FROM facultad
        WHERE $1::uuid IS NOT NULL ORDER BY nombre`,
    )
  }

  @Puede('read', 'Facultad')
  @Get('facultades/:id')
  obtener(
    @UniversidadActual() contexto: ContextoUniversidad,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.bd.obtenerEnUniversidad<Facultad>(
      contexto,
      `SELECT id, nombre, universidad_id FROM facultad
        WHERE universidad_id = $1 AND id = $2`,
      [id],
    )
  }
}

// Base propia con el seed cargado, que se crea y se borra en cada ejecución.
const BD_TEST = `${process.env.POSTGRES_TEST_DB ?? 'cursus_test'}_aislamiento`
const PASSWORD = 'contraseña-de-prueba'
const BD_ORIGINAL = process.env.POSTGRES_DB

let admin: DataSource
let bd: DataSource
let app: INestApplication<App>

// Inicia sesión con la contraseña del seed y devuelve el JWT.
async function tokenDe(correo: string): Promise<string> {
  const respuesta = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ correo, password: PASSWORD })
    .expect(200)
  return (respuesta.body as RespuestaLogin).accessToken
}

const pedir = (ruta: string, token: string) =>
  request(app.getHttpServer()).get(ruta).set('Authorization', `Bearer ${token}`)

// Facultades de una universidad del seed, leídas directo de la base.
const facultadesDe = (dominio: string) =>
  bd.query<Facultad[]>(
    `SELECT f.id, f.nombre, f.universidad_id FROM facultad f
       JOIN universidad un ON un.id = f.universidad_id
      WHERE un.dominio_correo = $1 ORDER BY f.nombre`,
    [dominio],
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
    controllers: [FacultadesPruebaController],
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

describe('aislamiento entre universidades', () => {
  // Los usuarios del seed de las dos universidades, salvo los directores: su
  // lectura de todas las universidades es de MT-03.
  const casos = UNIVERSIDADES.flatMap((universidad) => {
    const otra = UNIVERSIDADES.find((u) => u !== universidad)!
    return universidad.usuarios
      .filter((usuario) => usuario.rol !== 'DIRECTOR')
      .map((usuario) => ({
        correo: `${usuario.usuario}@${universidad.dominio}`,
        rol: usuario.rol,
        dominio: universidad.dominio,
        otroDominio: otra.dominio,
      }))
  })

  describe.each(casos)('$correo ($rol)', ({ correo, dominio, otroDominio }) => {
    let token: string

    beforeAll(async () => {
      token = await tokenDe(correo)
    })

    it('lista solo las facultades de su universidad', async () => {
      const respuesta = await pedir('/api/prueba/facultades', token).expect(200)
      expect(respuesta.body).toEqual(await facultadesDe(dominio))
    })

    it('con una consulta que olvida el filtro, RLS igual devuelve solo su universidad', async () => {
      const respuesta = await pedir(
        '/api/prueba/facultades-sin-filtro',
        token,
      ).expect(200)
      expect(respuesta.body).toEqual(await facultadesDe(dominio))
    })

    it('lee una facultad de su universidad', async () => {
      const [propia] = await facultadesDe(dominio)
      const respuesta = await pedir(
        `/api/prueba/facultades/${propia.id}`,
        token,
      ).expect(200)
      expect(respuesta.body).toEqual(propia)
    })

    it('recibe 404 al pedir una facultad de la otra universidad', async () => {
      for (const ajena of await facultadesDe(otroDominio)) {
        await pedir(`/api/prueba/facultades/${ajena.id}`, token).expect(404)
      }
    })
  })

  it('la otra universidad responde igual que un recurso inexistente', async () => {
    const token = await tokenDe(`alumno@${UNIVERSIDADES[0].dominio}`)
    const [ajena] = await facultadesDe(UNIVERSIDADES[1].dominio)
    const inexistente = randomUUID()

    const deOtra = await pedir(`/api/prueba/facultades/${ajena.id}`, token)
    const noExiste = await pedir(`/api/prueba/facultades/${inexistente}`, token)

    expect(deOtra.status).toBe(404)
    expect(deOtra.body).toEqual(noExiste.body)
  })
})

describe('GET /api/auth/yo con la universidad del token', () => {
  const jwt = new JwtService({ secret: process.env.JWT_SECRET })

  // Token de una sesión real (con su sid activo), firmado de nuevo con otra
  // universidad: así lo rechaza el filtro por universidad y no JwtAuthGuard.
  async function tokenConUniversidad(correo: string, universidadId: string) {
    const real = jwt.decode<PayloadJwt>(await tokenDe(correo))
    return jwt.sign({
      sid: real.sid,
      sub: real.sub,
      rol: real.rol,
      universidad_id: universidadId,
    } satisfies PayloadJwt)
  }

  it('responde 200 con la universidad del usuario', async () => {
    const [norte] = UNIVERSIDADES
    const correo = `alumno@${norte.dominio}`
    const real = jwt.decode<PayloadJwt>(await tokenDe(correo))

    const token = await tokenConUniversidad(correo, real.universidad_id)
    await pedir('/api/auth/yo', token).expect(200)
  })

  it('responde 401 si el token trae una universidad que no es la del usuario', async () => {
    const [norte, sur] = UNIVERSIDADES
    const [universidadSur] = await bd.query<{ id: string }[]>(
      'SELECT id FROM universidad WHERE dominio_correo = $1',
      [sur.dominio],
    )

    const token = await tokenConUniversidad(
      `alumno@${norte.dominio}`,
      universidadSur.id,
    )
    await pedir('/api/auth/yo', token).expect(401)
  })
})
