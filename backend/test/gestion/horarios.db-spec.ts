import type {
  BloqueHorario,
  CursoDetalle,
  HorarioSeccion,
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

const BD_TEST = `${process.env.POSTGRES_TEST_DB ?? 'cursus_test'}_horarios`
const BD_ORIGINAL = process.env.POSTGRES_DB
const PASSWORD = 'contraseña-de-prueba'
const ADMIN = 'administrativo.ingenieria@norte.cursus.test'
const ECONOMIA = 'administrativo.economia@norte.cursus.test'
const DIRECTOR = 'director@norte.cursus.test'
const BLOQUES: BloqueHorario[] = [
  { dia: 1, inicio: '08:30', termino: '09:20', sala: 'Sala 201' },
  { dia: 3, inicio: '10:00', termino: '11:30', sala: 'Laboratorio A' },
]
let admin: DataSource
let bd: DataSource
let app: INestApplication<App>
let seccion: { id: string; curso_id: string; universidad_id: string }
const tokens = new Map<string, string>()

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
async function obtener(id = seccion.id, estado = 200, correo = ADMIN) {
  const token = await tokenDe(correo)
  return request(app.getHttpServer())
    .get(`/api/secciones/${id}/horario`)
    .set('Authorization', `Bearer ${token}`)
    .expect(estado)
}
async function guardar(
  bloques: BloqueHorario[],
  version = 0,
  estado = 200,
  id = seccion.id,
  correo = ADMIN,
) {
  const token = await tokenDe(correo)
  return request(app.getHttpServer())
    .put(`/api/secciones/${id}/horario`)
    .set('Authorization', `Bearer ${token}`)
    .send({ version, bloques })
    .expect(estado)
}
async function detalle(correo = ADMIN): Promise<CursoDetalle> {
  const token = await tokenDe(correo)
  return (
    await request(app.getHttpServer())
      .get(`/api/cursos/${seccion.curso_id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
  ).body as CursoDetalle
}
async function filas() {
  return bd.query<{ id: string; archived_at: Date | null; sala: string }[]>(
    'SELECT id, archived_at, sala FROM horario_seccion ORDER BY created_at, id',
  )
}

beforeAll(async () => {
  admin = await new DataSource(opcionesDataSource()).initialize()
  await admin.query(`DROP DATABASE IF EXISTS "${BD_TEST}" WITH (FORCE)`)
  await admin.query(`CREATE DATABASE "${BD_TEST}"`)
  bd = await new DataSource(opcionesDataSource(BD_TEST)).initialize()
  await bd.runMigrations()
  await ejecutarSeed(bd, PASSWORD)
  ;[seccion] = await bd.query<(typeof seccion)[]>(
    `SELECT s.id, s.curso_id, s.universidad_id FROM seccion s JOIN curso c ON c.id = s.curso_id
      WHERE c.codigo = 'ICC101' AND s.numero = 1`,
  )
  process.env.POSTGRES_DB = BD_TEST
  const modulo = await Test.createTestingModule({
    imports: [AppModule],
  }).compile()
  app = modulo.createNestApplication<INestApplication<App>>({ logger: false })
  configurarApp(app, { secretoOrigen: '' })
  await app.listen(0, '127.0.0.1')
})
beforeEach(async () => {
  await bd.query('TRUNCATE horario_seccion')
  await bd.query('UPDATE seccion SET horario_version = 0')
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

describe('GES-10: horario semanal de una sección', () => {
  it('una sección sin horario comienza vacía', async () => {
    expect((await obtener()).body).toEqual({
      version: 0,
      bloques: [],
      resumen: null,
    })
  })

  it('guarda varios bloques y los muestra ordenados al recargar y en el detalle', async () => {
    const respuesta = await guardar([...BLOQUES].reverse())
    const esperado: HorarioSeccion = {
      version: 1,
      bloques: BLOQUES,
      resumen:
        'Lunes 08:30–09:20 · Sala 201; Miércoles 10:00–11:30 · Laboratorio A',
    }
    expect(respuesta.body).toEqual(esperado)
    expect((await obtener()).body).toEqual(esperado)
    for (const correo of [ADMIN, DIRECTOR]) {
      expect(
        (await detalle(correo)).secciones.find((s) => s.id === seccion.id)
          ?.horario,
      ).toBe(esperado.resumen)
    }
    expect(
      (await detalle()).secciones.find((s) => s.numero === 2)?.horario,
    ).toBeNull()
  })

  it('modifica y quita bloques, conservando las filas anteriores archivadas', async () => {
    await guardar(BLOQUES)
    const iniciales = await filas()
    const nuevo = [{ ...BLOQUES[1], sala: 'Sala 305' }]
    expect((await guardar(nuevo, 1)).body).toMatchObject({
      version: 2,
      bloques: nuevo,
    })
    expect((await obtener()).body).toMatchObject({ bloques: nuevo })
    const todos = await filas()
    expect(todos).toHaveLength(3)
    for (const original of iniciales) {
      expect(todos.find((f) => f.id === original.id)).toMatchObject({
        archived_at: expect.any(Date) as Date,
      })
    }
    expect(todos.filter((f) => f.archived_at === null)).toHaveLength(1)
  })

  it('permite quitar el último bloque y deja el detalle sin asignar', async () => {
    await guardar(BLOQUES)
    expect((await guardar([], 1)).body).toEqual({
      version: 2,
      bloques: [],
      resumen: null,
    })
    expect(
      (await detalle()).secciones.find((s) => s.id === seccion.id)?.horario,
    ).toBeNull()
    expect((await filas()).every((f) => f.archived_at instanceof Date)).toBe(
      true,
    )
  })

  it.each([
    [{ ...BLOQUES[0], termino: '08:30' }],
    [{ ...BLOQUES[0], termino: '07:00' }],
    [BLOQUES[0], { ...BLOQUES[0], inicio: '09:00' }],
    [BLOQUES[0], BLOQUES[0]],
  ])(
    'rechaza horas inválidas o bloques superpuestos sin cambios parciales: %j',
    async (...entrada) => {
      await guardar(BLOQUES)
      const antes = await filas()
      await guardar(entrada, 1, 400)
      expect(await filas()).toEqual(antes)
      expect((await obtener()).body).toMatchObject({
        version: 1,
        bloques: BLOQUES,
      })
    },
  )

  it('acepta bloques consecutivos y normaliza el nombre de la sala', async () => {
    const bloques = [
      BLOQUES[0],
      {
        ...BLOQUES[0],
        inicio: '09:20',
        termino: '10:10',
        sala: '  Sala   202  ',
      },
    ]
    expect((await guardar(bloques)).body).toMatchObject({
      bloques: [BLOQUES[0], { ...bloques[1], sala: 'Sala 202' }],
    })
  })

  it('revierte el reemplazo completo si falla una escritura después del archivado', async () => {
    await guardar(BLOQUES)
    const antes = await filas()
    await bd.query(`CREATE FUNCTION rechazar_horario_prueba() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Fallo de escritura simulado'; END; $$`)
    await bd.query(`CREATE TRIGGER tg_horario_prueba BEFORE INSERT ON horario_seccion
      FOR EACH ROW EXECUTE FUNCTION rechazar_horario_prueba()`)
    try {
      await guardar([{ ...BLOQUES[0], sala: 'Sala nueva' }], 1, 500)
      expect(await filas()).toEqual(antes)
      expect((await obtener()).body).toMatchObject({
        version: 1,
        bloques: BLOQUES,
      })
    } finally {
      await bd.query('DROP TRIGGER tg_horario_prueba ON horario_seccion')
      await bd.query('DROP FUNCTION rechazar_horario_prueba()')
    }
  })

  it('rechaza una versión antigua y conserva el horario más reciente', async () => {
    await guardar(BLOQUES)
    const respuesta = await guardar([], 0, 409)
    expect(respuesta.body).toMatchObject({
      message: 'El horario cambió. Vuelve a cargarlo antes de guardar.',
    })
    expect((await obtener()).body).toMatchObject({
      version: 1,
      bloques: BLOQUES,
    })
  })

  it('dos guardados simultáneos no sobrescriben silenciosamente el horario', async () => {
    const token = await tokenDe()
    const enviar = (bloques: BloqueHorario[]) =>
      request(app.getHttpServer())
        .put(`/api/secciones/${seccion.id}/horario`)
        .set('Authorization', `Bearer ${token}`)
        .send({ version: 0, bloques })
    const respuestas = await Promise.all([
      enviar([BLOQUES[0]]),
      enviar([BLOQUES[1]]),
    ])
    expect(respuestas.map((r) => r.status).sort()).toEqual([200, 409])
    expect((await obtener()).body).toEqual(
      respuestas.find((r) => r.status === 200)!.body,
    )
    expect((await filas()).filter((f) => f.archived_at === null)).toHaveLength(
      1,
    )
  })

  it('asignar profesor conserva el horario en la respuesta y en el detalle', async () => {
    const horario = (await guardar(BLOQUES)).body as HorarioSeccion
    const [{ id }] = await bd.query<{ id: string }[]>(
      "SELECT id FROM usuario WHERE correo = 'profesor@norte.cursus.test'",
    )
    const token = await tokenDe()
    const respuesta = await request(app.getHttpServer())
      .put(`/api/secciones/${seccion.id}/profesor`)
      .set('Authorization', `Bearer ${token}`)
      .send({ profesorId: id })
      .expect(200)
    expect(respuesta.body).toMatchObject({ horario: horario.resumen })
    expect(
      (await detalle()).secciones.find((s) => s.id === seccion.id)?.horario,
    ).toBe(horario.resumen)
  })

  it('no comprueba todavía ocupación de salas entre secciones (GES-11)', async () => {
    const [{ id }] = await bd.query<{ id: string }[]>(
      'SELECT id FROM seccion WHERE curso_id = $1 AND numero = 2',
      [seccion.curso_id],
    )
    await guardar(BLOQUES)
    await guardar(BLOQUES, 0, 200, id)
    expect((await filas()).filter((f) => f.archived_at === null)).toHaveLength(
      4,
    )
  })

  it.each([ECONOMIA, 'administrativo@sur.cursus.test'])(
    'oculta la sección ante %s',
    async (correo) => {
      await obtener(seccion.id, 404, correo)
      await guardar(BLOQUES, 0, 404, seccion.id, correo)
      expect(await filas()).toEqual([])
    },
  )

  it.each(['seccion', 'curso'])(
    'rechaza una sección con %s archivado',
    async (tabla) => {
      const id = tabla === 'seccion' ? seccion.id : seccion.curso_id
      await bd.query(`UPDATE ${tabla} SET archived_at = now() WHERE id = $1`, [
        id,
      ])
      try {
        await obtener(seccion.id, 404)
        await guardar(BLOQUES, 0, 404)
      } finally {
        await bd.query(`UPDATE ${tabla} SET archived_at = NULL WHERE id = $1`, [
          id,
        ])
      }
      expect(await filas()).toEqual([])
    },
  )

  it('la FK rechaza una sección de otra universidad incluso fuera de la API', async () => {
    const [{ id }] = await bd.query<{ id: string }[]>(
      'SELECT id FROM seccion WHERE universidad_id <> $1 LIMIT 1',
      [seccion.universidad_id],
    )
    await expect(
      bd.query(
        `INSERT INTO horario_seccion (universidad_id, seccion_id, dia, inicio, termino, sala)
      VALUES ($1, $2, 1, '08:30', '09:20', 'Sala 201')`,
        [seccion.universidad_id, id],
      ),
    ).rejects.toMatchObject({
      code: '23503',
      constraint: 'fk_horario_seccion_seccion',
    })
  })
})
