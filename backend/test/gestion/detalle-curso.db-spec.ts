import type { CursoDetalle } from '@cursus/shared'
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
// crea y se borra en cada ejecución.
const BD_TEST = `${process.env.POSTGRES_TEST_DB ?? 'cursus_test'}_detalle`
const PASSWORD = 'contraseña-de-prueba'
const BD_ORIGINAL = process.env.POSTGRES_DB

// Usuarios del seed.
const ADMIN_INGENIERIA = 'administrativo.ingenieria@norte.cursus.test'
const ADMIN_ECONOMIA = 'administrativo.economia@norte.cursus.test'
const ADMIN_SUR = 'administrativo@sur.cursus.test'
const DIRECTOR = 'director@norte.cursus.test'

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
async function detalle(correo: string, id: string, estado = 200) {
  const token = await tokenDe(correo)
  const respuesta = await request(app.getHttpServer())
    .get(`/api/cursos/${id}`)
    .set('Authorization', `Bearer ${token}`)
    .expect(estado)
  return respuesta.body as CursoDetalle
}

const idDe = async (codigo: string) =>
  (
    await bd.query<{ id: string }[]>('SELECT id FROM curso WHERE codigo = $1', [
      codigo,
    ])
  )[0].id

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

describe('GET /api/cursos/:id', () => {
  it('devuelve el curso con sus secciones ordenadas por número', async () => {
    const id = await idDe('ICC101')
    // Una tercera sección creada antes que la 2, para revisar el orden.
    await bd.query(
      `INSERT INTO seccion (universidad_id, curso_id, numero)
       SELECT universidad_id, id, 3 FROM curso WHERE id = $1`,
      [id],
    )
    await bd.query(
      "UPDATE seccion SET created_at = now() - interval '1 day' WHERE numero = 3",
    )

    const curso = await detalle(ADMIN_INGENIERIA, id)
    expect(curso).toEqual({
      id,
      codigo: 'ICC101',
      nombre: 'Introducción a la Programación',
      carreraNombre: 'Ingeniería Civil en Informática',
      periodo: { id: expect.any(String) as string, anio: 2026, semestre: 2 },
      secciones: [1, 2, 3].map((numero) => ({
        id: expect.any(String) as string,
        numero,
        horario: null,
        profesor: null,
        ayudantes: [],
        alumnos: 0,
      })),
    })
  })

  it('no incluye las secciones archivadas', async () => {
    const id = await idDe('ICC201')
    await bd.query(
      'UPDATE seccion SET archived_at = now() WHERE curso_id = $1 AND numero = 2',
      [id],
    )
    const curso = await detalle(ADMIN_INGENIERIA, id)
    expect(curso.secciones.map((s) => s.numero)).toEqual([1])
  })

  it('devuelve un curso sin secciones con la lista vacía', async () => {
    const id = await idDe('ICO201')
    await bd.query(
      'UPDATE seccion SET archived_at = now() WHERE curso_id = $1',
      [id],
    )
    const curso = await detalle(ADMIN_ECONOMIA, id)
    expect(curso).toMatchObject({ codigo: 'ICO201', secciones: [] })
  })

  it('el listado cuenta las secciones vigentes de cada curso', async () => {
    const token = await tokenDe(ADMIN_INGENIERIA)
    const respuesta = await request(app.getHttpServer())
      .get('/api/cursos')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    const secciones = Object.fromEntries(
      (respuesta.body as { codigo: string; secciones: number }[]).map((c) => [
        c.codigo,
        c.secciones,
      ]),
    )
    expect(secciones).toEqual({ ICC101: 3, ICC201: 1 })
  })

  it('responde 404 con un curso de otra universidad', async () => {
    await detalle(ADMIN_SUR, await idDe('ICC101'), 404)
  })

  it('responde 404 con un curso de otra facultad', async () => {
    await detalle(ADMIN_ECONOMIA, await idDe('ICC101'), 404)
  })

  it('responde 404 con un curso que no existe', async () => {
    await detalle(ADMIN_INGENIERIA, '00000000-0000-4000-8000-000000000000', 404)
  })

  it('responde 404 con un curso archivado', async () => {
    const id = await idDe('ICO101')
    await bd.query('UPDATE curso SET archived_at = now() WHERE id = $1', [id])
    try {
      await detalle(ADMIN_ECONOMIA, id, 404)
    } finally {
      await bd.query('UPDATE curso SET archived_at = NULL WHERE id = $1', [id])
    }
  })

  it('responde 400 con un id que no es uuid', async () => {
    await detalle(ADMIN_INGENIERIA, 'no-es-uuid', 400)
  })

  it('el Director ve el detalle de un curso de otra universidad', async () => {
    const curso = await detalle(DIRECTOR, await idDe('ENF101'))
    expect(curso).toMatchObject({
      codigo: 'ENF101',
      universidadNombre: 'Universidad Demo Sur',
    })
    expect(curso.secciones.map((s) => s.numero)).toEqual([1, 2])
  })
})
