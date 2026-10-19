import { randomUUID } from 'node:crypto'
import type { Carrera } from '@cursus/shared'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { DataSource } from 'typeorm'
import { AppModule } from '../../src/app.module.js'
import { configurarApp } from '../../src/config/configurar-app.js'
import { opcionesDataSource } from '../../src/database/data-source.js'
import { ejecutarSeed } from '../../src/database/seed.js'

const BD_TEST = `${process.env.POSTGRES_TEST_DB ?? 'cursus_test'}_carreras`
const BD_ORIGINAL = process.env.POSTGRES_DB
const PASSWORD = 'password-solo-para-pruebas'
const INGENIERIA = 'administrativo.ingenieria@norte.cursus.test'
const ECONOMIA = 'administrativo.economia@norte.cursus.test'
const SALUD = 'administrativo@sur.cursus.test'
let admin: DataSource
let bd: DataSource
let app: INestApplication<App>
const tokens = new Map<string, string>()

async function tokenDe(correo: string) {
  if (tokens.has(correo)) return tokens.get(correo)!
  const respuesta = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ correo, password: PASSWORD })
    .expect(200)
  const { accessToken } = respuesta.body as { accessToken: string }
  tokens.set(correo, accessToken)
  return accessToken
}

async function listar(correo = INGENIERIA) {
  const respuesta = await request(app.getHttpServer())
    .get('/api/carreras')
    .set('Authorization', `Bearer ${await tokenDe(correo)}`)
    .expect(200)
  return respuesta.body as Carrera[]
}

async function crear(nombre: string, correo = INGENIERIA) {
  return request(app.getHttpServer())
    .post('/api/carreras')
    .set('Authorization', `Bearer ${await tokenDe(correo)}`)
    .send({ nombre })
}

async function editar(id: string, nombre: string, correo = INGENIERIA) {
  return request(app.getHttpServer())
    .patch(`/api/carreras/${id}`)
    .set('Authorization', `Bearer ${await tokenDe(correo)}`)
    .send({ nombre })
}

beforeAll(async () => {
  admin = await new DataSource(opcionesDataSource()).initialize()
  await admin.query(`DROP DATABASE IF EXISTS "${BD_TEST}" WITH (FORCE)`)
  await admin.query(`CREATE DATABASE "${BD_TEST}"`)
  bd = await new DataSource(opcionesDataSource(BD_TEST)).initialize()
  await bd.runMigrations()
  await ejecutarSeed(bd, PASSWORD)
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

describe('GES-01: carreras de la facultad del administrativo', () => {
  it('cada administrativo solo lista la carrera inicial de su propia facultad y universidad', async () => {
    expect((await listar()).map((c) => c.nombre)).toEqual([
      'Ingeniería Civil en Informática',
    ])
    expect((await listar(ECONOMIA)).map((c) => c.nombre)).toEqual([
      'Ingeniería Comercial',
    ])
    expect((await listar(SALUD)).map((c) => c.nombre)).toEqual(['Enfermería'])
  })

  it('crea en su facultad y normaliza los espacios sin recibir identificadores de ámbito', async () => {
    const nombre = `Carrera ${randomUUID()}`
    const respuesta = await crear(`  ${nombre.replace(' ', '   ')}  `)
    expect(respuesta.status).toBe(201)
    const carrera = respuesta.body as Carrera
    expect(carrera.nombre).toBe(nombre)
    const [fila] = await bd.query<{ propia: boolean }[]>(
      `SELECT c.facultad_id = u.facultad_id AND c.universidad_id = u.universidad_id AS propia FROM carrera c JOIN usuario u ON u.correo = $1 WHERE c.id = $2`,
      [INGENIERIA, carrera.id],
    )
    expect(fila.propia).toBe(true)
    expect((await listar()).some((c) => c.id === carrera.id)).toBe(true)
    expect((await listar(ECONOMIA)).some((c) => c.id === carrera.id)).toBe(
      false,
    )
    expect((await listar(SALUD)).some((c) => c.id === carrera.id)).toBe(false)
  })

  it('edita y permite guardar el mismo nombre de la propia carrera', async () => {
    const inicial = (await crear(`Inicial ${randomUUID()}`)).body as Carrera
    const nombre = `Editada ${randomUUID()}`
    const respuesta = await editar(inicial.id, nombre)
    expect(respuesta.status).toBe(200)
    expect(respuesta.body as Carrera).toEqual({ id: inicial.id, nombre })
    expect((await editar(inicial.id, nombre)).status).toBe(200)
    expect((await listar()).find((c) => c.id === inicial.id)?.nombre).toBe(
      nombre,
    )
  })

  it('rechaza duplicados por mayúsculas y espacios al crear y editar con 409', async () => {
    const nombre = `Duplicada ${randomUUID()}`
    expect((await crear(nombre)).status).toBe(201)
    expect(
      (await crear(` ${nombre.toUpperCase().replace(' ', '   ')} `)).status,
    ).toBe(409)
    const otra = (await crear(`Otra ${randomUUID()}`)).body as Carrera
    expect((await editar(otra.id, nombre)).status).toBe(409)
    expect((await listar()).find((c) => c.id === otra.id)?.nombre).toBe(
      otra.nombre,
    )
  })

  it('permite el mismo nombre en otra facultad y en otra universidad', async () => {
    const nombre = `Compartida ${randomUUID()}`
    for (const correo of [INGENIERIA, ECONOMIA, SALUD])
      expect((await crear(nombre, correo)).status).toBe(201)
    for (const correo of [INGENIERIA, ECONOMIA, SALUD])
      expect(
        (await listar(correo)).filter((c) => c.nombre === nombre),
      ).toHaveLength(1)
  })

  it('dos creaciones concurrentes del mismo nombre producen un éxito y un conflicto', async () => {
    const nombre = `Concurrente ${randomUUID()}`
    const respuestas = await Promise.all([
      crear(nombre),
      crear(nombre.toUpperCase()),
    ])
    expect(respuestas.map((r) => r.status).sort()).toEqual([201, 409])
    expect(
      (await listar()).filter(
        (c) => c.nombre.toLowerCase() === nombre.toLowerCase(),
      ),
    ).toHaveLength(1)
  })

  it.each([ECONOMIA, SALUD])(
    'no permite editar una carrera de %s y no revela su existencia',
    async (correo) => {
      const ajena = (await crear(`Ajena ${randomUUID()}`, correo))
        .body as Carrera
      const respuesta = await editar(ajena.id, 'Nombre ajeno modificado')
      const inexistente = await editar(randomUUID(), 'Nombre inexistente')
      expect(respuesta.status).toBe(404)
      expect(inexistente.status).toBe(404)
      expect(respuesta.body as unknown).toEqual(inexistente.body as unknown)
      expect(
        (await listar(correo)).find((c) => c.id === ajena.id)?.nombre,
      ).toBe(ajena.nombre)
    },
  )

  it('no confía en facultad_id/universidad_id enviados por el cliente', async () => {
    const respuesta = await request(app.getHttpServer())
      .post('/api/carreras')
      .set('Authorization', `Bearer ${await tokenDe(INGENIERIA)}`)
      .send({
        nombre: 'Inyección de ámbito',
        facultad_id: randomUUID(),
        universidad_id: randomUUID(),
      })
      .expect(400)
    expect(respuesta.headers['x-content-type-options']).toBe('nosniff')
    const consulta = await request(app.getHttpServer())
      .get(
        `/api/carreras?facultad_id=${randomUUID()}&universidad_id=${randomUUID()}`,
      )
      .set('Authorization', `Bearer ${await tokenDe(INGENIERIA)}`)
      .expect(200)
    expect(consulta.body as Carrera[]).toEqual(await listar())
  })

  it.each(['', '   ', 'a'.repeat(151), 123, null])(
    'rechaza un nombre inválido: %s',
    async (nombre) => {
      await request(app.getHttpServer())
        .post('/api/carreras')
        .set('Authorization', `Bearer ${await tokenDe(INGENIERIA)}`)
        .send({ nombre })
        .expect(400)
    },
  )

  it('rechaza IDs inválidos antes de consultar la carrera', async () => {
    expect((await editar('no-es-uuid', 'Nueva')).status).toBe(400)
  })

  it.each([
    'director@norte.cursus.test',
    'profesor@norte.cursus.test',
    'ayudante@norte.cursus.test',
    'alumno@norte.cursus.test',
  ])('%s no puede listar, crear ni editar en GES-01', async (correo) => {
    const token = await tokenDe(correo)
    await request(app.getHttpServer())
      .get('/api/carreras')
      .set('Authorization', `Bearer ${token}`)
      .expect(403)
    expect((await crear('Prohibida', correo)).status).toBe(403)
    expect((await editar(randomUUID(), 'Prohibida', correo)).status).toBe(403)
  })

  it('las tres operaciones exigen sesión', async () => {
    await request(app.getHttpServer()).get('/api/carreras').expect(401)
    await request(app.getHttpServer())
      .post('/api/carreras')
      .send({ nombre: 'Sin sesión' })
      .expect(401)
    await request(app.getHttpServer())
      .patch(`/api/carreras/${randomUUID()}`)
      .send({ nombre: 'Sin sesión' })
      .expect(401)
  })

  it('no muestra ni edita carreras archivadas', async () => {
    const carrera = (await crear(`Archivada ${randomUUID()}`)).body as Carrera
    await bd.query('UPDATE carrera SET archived_at = now() WHERE id = $1', [
      carrera.id,
    ])
    expect((await listar()).some((c) => c.id === carrera.id)).toBe(false)
    expect((await editar(carrera.id, 'No debe cambiar')).status).toBe(404)
  })

  it('la facultad se lee de la BD en cada petición, incluso con un token anterior', async () => {
    const [{ facultad_id: original }] = await bd.query<
      { facultad_id: string }[]
    >('SELECT facultad_id FROM usuario WHERE correo = $1', [INGENIERIA])
    await bd.query(
      'UPDATE usuario SET facultad_id = (SELECT facultad_id FROM usuario WHERE correo = $1) WHERE correo = $2',
      [ECONOMIA, INGENIERIA],
    )
    try {
      const economicas = await listar(ECONOMIA)
      expect(await listar()).toEqual(economicas)
    } finally {
      await bd.query('UPDATE usuario SET facultad_id = $1 WHERE correo = $2', [
        original,
        INGENIERIA,
      ])
    }
  })
})
