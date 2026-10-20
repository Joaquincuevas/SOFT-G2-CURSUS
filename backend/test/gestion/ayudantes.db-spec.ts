import type {
  AyudanteOpcion,
  AyudanteResumen,
  CursoDetalle,
} from '@cursus/shared'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { DataSource } from 'typeorm'
import { AppModule } from '../../src/app.module.js'
import { configurarApp } from '../../src/config/configurar-app.js'
import { opcionesDataSource } from '../../src/database/data-source.js'
import { ejecutarSeed } from '../../src/database/seed.js'

const BD_TEST = `${process.env.POSTGRES_TEST_DB ?? 'cursus_test'}_ayudantes`
const BD_ORIGINAL = process.env.POSTGRES_DB
const PASSWORD = 'contraseña-de-prueba'
const ADMIN = 'administrativo.ingenieria@norte.cursus.test'
const ECONOMIA = 'administrativo.economia@norte.cursus.test'
const DIRECTOR = 'director@norte.cursus.test'
let admin: DataSource
let bd: DataSource
let app: INestApplication<App>
const tokens = new Map<string, string>()

const usuarioDe = async (correo: string) =>
  (
    await bd.query<{ id: string; universidad_id: string; nombre: string }[]>(
      'SELECT id, universidad_id, nombre FROM usuario WHERE correo = $1',
      [correo],
    )
  )[0]
const seccionDe = async (codigo: string, numero = 1) =>
  (
    await bd.query<{ id: string; curso_id: string; universidad_id: string }[]>(
      `SELECT s.id, s.curso_id, s.universidad_id FROM seccion s JOIN curso c ON c.id = s.curso_id
      WHERE c.codigo = $1 AND s.numero = $2`,
      [codigo, numero],
    )
  )[0]

async function tokenDe(correo = ADMIN) {
  if (!tokens.has(correo)) {
    const respuesta = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ correo, password: PASSWORD })
      .expect(200)
    tokens.set(correo, (respuesta.body as { accessToken: string }).accessToken)
  }
  return tokens.get(correo)!
}
async function listar(id: string, estado = 200, correo = ADMIN) {
  const token = await tokenDe(correo)
  return request(app.getHttpServer())
    .get(`/api/secciones/${id}/ayudantes`)
    .set('Authorization', `Bearer ${token}`)
    .expect(estado)
}
async function asignar(
  id: string,
  ayudanteIds: string[],
  estado = 200,
  correo = ADMIN,
) {
  const token = await tokenDe(correo)
  return request(app.getHttpServer())
    .post(`/api/secciones/${id}/ayudantes`)
    .set('Authorization', `Bearer ${token}`)
    .send({ ayudanteIds })
    .expect(estado)
}
async function detalle(id: string, correo = ADMIN): Promise<CursoDetalle> {
  const token = await tokenDe(correo)
  return (
    await request(app.getHttpServer())
      .get(`/api/cursos/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
  ).body as CursoDetalle
}
const cantidad = async () =>
  (
    await bd.query<{ total: number }[]>(
      'SELECT count(*)::int AS total FROM ayudante_seccion',
    )
  )[0].total

beforeAll(async () => {
  admin = await new DataSource(opcionesDataSource()).initialize()
  await admin.query(`DROP DATABASE IF EXISTS "${BD_TEST}" WITH (FORCE)`)
  await admin.query(`CREATE DATABASE "${BD_TEST}"`)
  bd = await new DataSource(opcionesDataSource(BD_TEST)).initialize()
  await bd.runMigrations()
  await ejecutarSeed(bd, PASSWORD)
  await bd.query(`INSERT INTO usuario (universidad_id, facultad_id, nombre, correo, password_hash, rol, archived_at)
    SELECT universidad_id, facultad_id, 'Ayudante archivado', 'archivado@norte.cursus.test', password_hash, 'AYUDANTE', now()
      FROM usuario WHERE correo = 'ayudante@norte.cursus.test'`)
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

describe('GES-13: asignación de ayudantes', () => {
  it('ofrece todos los ayudantes activos de la universidad, incluyendo otra facultad', async () => {
    const seccion = await seccionDe('ICC101')
    const respuesta = await listar(seccion.id)
    const esperados = await bd.query<
      { id: string; nombre: string; correo: string }[]
    >(
      `SELECT id, nombre, correo FROM usuario WHERE universidad_id = $1 AND rol = 'AYUDANTE'
        AND archived_at IS NULL ORDER BY nombre, correo, id`,
      [seccion.universidad_id],
    )
    expect(esperados.length).toBeGreaterThan(1)
    expect(respuesta.body).toEqual(
      esperados.map((a) => ({ ...a, asignado: false })),
    )
    const deEconomia = await bd.query<{ id: string }[]>(
      `SELECT id FROM usuario WHERE universidad_id = $1 AND rol = 'AYUDANTE'
        AND facultad_id = (SELECT facultad_id FROM usuario WHERE correo = $2)`,
      [seccion.universidad_id, ECONOMIA],
    )
    expect(deEconomia.length).toBeGreaterThan(0)
    const opciones = respuesta.body as AyudanteOpcion[]
    for (const { id } of deEconomia) {
      expect(opciones.some((opcion) => opcion.id === id)).toBe(true)
    }
  })

  it('asigna varios y los conserva en el detalle para el administrativo y el Director', async () => {
    const seccion = await seccionDe('ICC101')
    const opciones = (await listar(seccion.id)).body as AyudanteOpcion[]
    const respuesta = await asignar(
      seccion.id,
      opciones.slice(0, 2).map((a) => a.id),
    )
    const asignados = respuesta.body as AyudanteResumen[]
    expect(asignados).toHaveLength(2)
    const nombres = asignados.map((a) => a.nombre)
    for (const correo of [ADMIN, DIRECTOR]) {
      expect(
        (await detalle(seccion.curso_id, correo)).secciones.find(
          (s) => s.id === seccion.id,
        )?.ayudantes,
      ).toEqual(nombres)
    }
    const listados = (await listar(seccion.id)).body as AyudanteOpcion[]
    expect(listados.filter((a) => a.asignado).map((a) => a.id)).toEqual(
      asignados.map((a) => a.id),
    )
  })

  it('repetir la asignación es idempotente y no crea duplicados', async () => {
    const seccion = await seccionDe('ICC101')
    const opciones = (await listar(seccion.id)).body as AyudanteOpcion[]
    const antes = await cantidad()
    await asignar(
      seccion.id,
      opciones.filter((a) => a.asignado).map((a) => a.id),
    )
    expect(await cantidad()).toBe(antes)
  })

  it('dos asignaciones simultáneas del mismo ayudante guardan una sola fila', async () => {
    const seccion = await seccionDe('ICC201', 2)
    const ayudante = await usuarioDe('ayudante@norte.cursus.test')
    await tokenDe()
    const antes = await cantidad()
    await Promise.all([
      asignar(seccion.id, [ayudante.id]),
      asignar(seccion.id, [ayudante.id]),
    ])
    expect(await cantidad()).toBe(antes + 1)
  })

  it('permite asignar el mismo ayudante a distintas secciones sin modificar las anteriores', async () => {
    const seccion = await seccionDe('ICC101', 2)
    const ayudante = await usuarioDe('ayudante@norte.cursus.test')
    await asignar(seccion.id, [ayudante.id])
    const curso = await detalle(seccion.curso_id)
    expect(curso.secciones.find((s) => s.numero === 1)?.ayudantes).toHaveLength(
      2,
    )
    expect(curso.secciones.find((s) => s.numero === 2)?.ayudantes).toEqual([
      ayudante.nombre,
    ])
  })

  it.each([
    'profesor@norte.cursus.test',
    'ayudante@sur.cursus.test',
    'archivado@norte.cursus.test',
  ])('rechaza %s y revierte el conjunto completo', async (correo) => {
    const seccion = await seccionDe('ICC201')
    const valido = await usuarioDe('ayudante@norte.cursus.test')
    const invalido = await usuarioDe(correo)
    const antes = await cantidad()
    const respuesta = await asignar(seccion.id, [valido.id, invalido.id], 400)
    expect(respuesta.body).toMatchObject({
      message: 'Selecciona ayudantes activos de tu universidad',
    })
    expect(await cantidad()).toBe(antes)
  })

  it('rechaza un usuario inexistente sin dejar asignaciones parciales', async () => {
    const antes = await cantidad()
    await asignar(
      (await seccionDe('ICC201')).id,
      ['00000000-0000-4000-8000-000000000000'],
      400,
    )
    expect(await cantidad()).toBe(antes)
  })

  it.each(['ICO101', 'ENF101'])(
    'oculta la sección de %s que no es de su facultad/universidad',
    async (codigo) => {
      const seccion = await seccionDe(codigo)
      const ayudante = await usuarioDe('ayudante@norte.cursus.test')
      await listar(seccion.id, 404)
      await asignar(seccion.id, [ayudante.id], 404)
    },
  )

  it('otro administrativo de la universidad no puede editar una sección de Ingeniería', async () => {
    await listar((await seccionDe('ICC101')).id, 404, ECONOMIA)
  })

  it.each(['seccion', 'curso'])(
    'oculta una sección con %s archivado',
    async (tabla) => {
      const seccion = await seccionDe('ICC201')
      const id = tabla === 'seccion' ? seccion.id : seccion.curso_id
      await bd.query(`UPDATE ${tabla} SET archived_at = now() WHERE id = $1`, [
        id,
      ])
      try {
        await listar(seccion.id, 404)
        await asignar(
          seccion.id,
          [(await usuarioDe('ayudante@norte.cursus.test')).id],
          404,
        )
      } finally {
        await bd.query(`UPDATE ${tabla} SET archived_at = NULL WHERE id = $1`, [
          id,
        ])
      }
    },
  )

  it('la FK impide cruzar la universidad del ayudante incluso sin usar la API', async () => {
    const seccion = await seccionDe('ICC101')
    const ajeno = await usuarioDe('ayudante@sur.cursus.test')
    await expect(
      bd.query(
        `INSERT INTO ayudante_seccion (universidad_id, seccion_id, usuario_id)
      VALUES ($1, $2, $3)`,
        [seccion.universidad_id, seccion.id, ajeno.id],
      ),
    ).rejects.toMatchObject({
      code: '23503',
      constraint: 'fk_ayudante_seccion_usuario',
    })
  })
})
