import type { CursoDetalle, SeccionDetalle } from '@cursus/shared'
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
// crea y se borra en cada ejecución (GES-09).
const BD_TEST = `${process.env.POSTGRES_TEST_DB ?? 'cursus_test'}_crear_seccion`
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
async function crearSeccion(correo: string, id: string, estado = 201) {
  const token = await tokenDe(correo)
  const respuesta = await request(app.getHttpServer())
    .post(`/api/cursos/${id}/secciones`)
    .set('Authorization', `Bearer ${token}`)
    .expect(estado)
  return respuesta.body as SeccionDetalle
}

async function numerosDe(id: string) {
  const token = await tokenDe(ADMIN_INGENIERIA)
  const respuesta = await request(app.getHttpServer())
    .get(`/api/cursos/${id}`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200)
  return (respuesta.body as CursoDetalle).secciones.map((s) => s.numero)
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
  // Escuchando de antemano: las peticiones en paralelo comparten el servidor
  // y supertest no lo cierra al terminar cada una.
  await app.listen(0)
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

describe('POST /api/cursos/:id/secciones', () => {
  it('crea las secciones con números correlativos, en el formato del detalle', async () => {
    // Un curso sin secciones, para partir desde la 1.
    const [{ id }] = await bd.query<{ id: string }[]>(
      `INSERT INTO curso (universidad_id, carrera_id, periodo_id, codigo, nombre)
       SELECT universidad_id, carrera_id, periodo_id, 'ICC301', 'Curso nuevo'
         FROM curso WHERE codigo = 'ICC101' RETURNING id`,
    )
    const creadas = [
      await crearSeccion(ADMIN_INGENIERIA, id),
      await crearSeccion(ADMIN_INGENIERIA, id),
      await crearSeccion(ADMIN_INGENIERIA, id),
    ]
    expect(creadas).toEqual(
      [1, 2, 3].map((numero) => ({
        id: expect.any(String) as string,
        numero,
        horario: null,
        profesor: null,
        profesorId: null,
        ayudantes: [],
        alumnos: 0,
      })),
    )
    // Aparecen de inmediato en el detalle.
    expect(await numerosDe(id)).toEqual([1, 2, 3])
  })

  it('dos creaciones en paralelo reciben números distintos', async () => {
    const id = await idDe('ICC201')
    await tokenDe(ADMIN_INGENIERIA)
    const numeros = (
      await Promise.all([
        crearSeccion(ADMIN_INGENIERIA, id),
        crearSeccion(ADMIN_INGENIERIA, id),
      ])
    ).map((s) => s.numero)
    expect(numeros.sort()).toEqual([3, 4])
  })

  it('con una sección archivada, la siguiente no reutiliza su número', async () => {
    const id = await idDe('ICO101')
    await bd.query(
      'UPDATE seccion SET archived_at = now() WHERE curso_id = $1 AND numero = 2',
      [id],
    )
    const seccion = await crearSeccion(ADMIN_ECONOMIA, id)
    expect(seccion.numero).toBe(3)
  })

  it('responde 404 con un curso de otra universidad', async () => {
    await crearSeccion(ADMIN_SUR, await idDe('ICC101'), 404)
  })

  it('responde 404 con un curso de otra facultad', async () => {
    await crearSeccion(ADMIN_ECONOMIA, await idDe('ICC101'), 404)
  })

  it('responde 404 con un curso archivado', async () => {
    const id = await idDe('ICO201')
    await bd.query('UPDATE curso SET archived_at = now() WHERE id = $1', [id])
    try {
      await crearSeccion(ADMIN_ECONOMIA, id, 404)
    } finally {
      await bd.query('UPDATE curso SET archived_at = NULL WHERE id = $1', [id])
    }
  })

  it('responde 400 con un id que no es uuid', async () => {
    await crearSeccion(ADMIN_INGENIERIA, 'no-es-uuid', 400)
  })

  it('el Director recibe 403 y no se crea nada', async () => {
    const id = await idDe('ENF101')
    await crearSeccion(DIRECTOR, id, 403)
    const [{ cantidad }] = await bd.query<{ cantidad: number }[]>(
      'SELECT count(*)::int AS cantidad FROM seccion WHERE curso_id = $1',
      [id],
    )
    expect(cantidad).toBe(2)
  })
})
