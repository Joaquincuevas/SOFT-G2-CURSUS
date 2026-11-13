import { randomUUID } from 'node:crypto'
import type { EventoAcceso, PaginaEventos } from '@cursus/shared'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { DataSource } from 'typeorm'
import { AppModule } from '../../src/app.module.js'
import type { RespuestaLogin } from '../../src/auth/auth.controller.js'
import { configurarApp } from '../../src/config/configurar-app.js'
import { ROL_APP } from '../../src/database/base-de-datos.service.js'
import { opcionesDataSource } from '../../src/database/data-source.js'
import { ejecutarSeed } from '../../src/database/seed.js'

// SEG-05: el Director consulta el registro de SEG-04. Base propia con el seed
// cargado. Los eventos de la consulta se insertan a mano, con fechas conocidas,
// después de iniciar las sesiones de prueba (que también dejan eventos).
const BD_TEST = `${process.env.POSTGRES_TEST_DB ?? 'cursus_test'}_auditoria`
const BD_ORIGINAL = process.env.POSTGRES_DB
const PASSWORD = 'password-de-prueba'
const RUTA = '/api/auditoria/eventos'

const DIRECTOR = 'director@norte.cursus.test'
const PROFESOR = 'profesor@norte.cursus.test'
const AYUDANTE = 'ayudante@norte.cursus.test'
const ALUMNO = 'alumno@norte.cursus.test'
const ADMIN = 'administrativo.ingenieria@norte.cursus.test'
const ALUMNO_SUR = 'alumno@sur.cursus.test'

let admin: DataSource
let bd: DataSource
let app: INestApplication<App>
const tokens = new Map<string, string>()
const ids = new Map<string, string>()
const universidades = new Map<string, string>()

const idDe = (correo: string) => ids.get(correo) as string

async function tokenDe(correo: string) {
  const respuesta = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ correo, password: PASSWORD })
    .expect(200)
  tokens.set(correo, (respuesta.body as RespuestaLogin).accessToken)
}

async function pedir(correo: string, consulta = '', estado = 200) {
  const respuesta = await request(app.getHttpServer())
    .get(`${RUTA}${consulta}`)
    .set('Authorization', `Bearer ${tokens.get(correo)}`)
    .expect(estado)
  return respuesta.body as PaginaEventos
}

const comoDirector = (consulta = '', estado = 200) =>
  pedir(DIRECTOR, consulta, estado)

// Eventos conocidos, del más antiguo al más reciente. Los dos últimos comparten
// fecha: el desempate es por id, también descendente.
const T = (dia: number, hora = 12) =>
  new Date(Date.UTC(2026, 9, dia, hora)).toISOString()

const IDS_EMPATE = [
  '00000000-0000-4000-8000-0000000000e1',
  'ffffffff-ffff-4fff-8fff-ffffffffffe2',
]

async function sembrarEventos() {
  let empates = 0
  await bd.query(
    'ALTER TABLE evento_auditoria DISABLE TRIGGER tg_evento_auditoria_inmutable',
  )
  await bd.query('DELETE FROM evento_auditoria')
  await bd.query(
    'ALTER TABLE evento_auditoria ENABLE TRIGGER tg_evento_auditoria_inmutable',
  )
  const norte = universidades.get('norte')
  const sur = universidades.get('sur')
  const filas: [
    string,
    string,
    string | null,
    string | null,
    string,
    string | null,
    string,
  ][] = [
    // tipo, resultado, usuario, universidad, fecha, ip, detalle
    [
      'INICIO_SESION',
      'EXITOSO',
      idDe(ALUMNO),
      norte!,
      T(1),
      '198.51.100.1',
      '{}',
    ],
    ['INICIO_SESION', 'FALLIDO', null, null, T(2), '198.51.100.2', '{}'],
    [
      'CAMBIO_NOTA',
      'EXITOSO',
      idDe(PROFESOR),
      norte!,
      T(3),
      null,
      '{"subtipo":"APROBACION","origen":"nota_cambio"}',
    ],
    [
      'ASIGNACION',
      'EXITOSO',
      idDe(ADMIN),
      norte!,
      T(4),
      null,
      '{"subtipo":"PROFESOR","origen":"asignacion_cambio"}',
    ],
    [
      'INICIO_SESION',
      'EXITOSO',
      idDe(ALUMNO_SUR),
      sur!,
      T(5),
      '203.0.113.5',
      '{}',
    ],
    [
      'CIERRE_CURSO',
      'EXITOSO',
      idDe(PROFESOR),
      norte!,
      T(6),
      null,
      '{"origen":"cierre_curso"}',
    ],
    [
      'INICIO_SESION',
      'BLOQUEADO',
      idDe(ALUMNO),
      norte!,
      T(7),
      '198.51.100.1',
      '{}',
    ],
    [
      'INICIO_SESION',
      'EXITOSO',
      idDe(ALUMNO),
      norte!,
      T(7),
      '198.51.100.1',
      '{}',
    ],
  ]
  for (const [
    tipo,
    resultado,
    usuario,
    universidad,
    fecha,
    ip,
    detalle,
  ] of filas) {
    // El de id menor se inserta primero: sin desempate por id, el orden de
    // inserción dejaría primero al menor.
    const id = fecha === T(7) ? IDS_EMPATE[empates++] : randomUUID()
    await bd.query(
      `INSERT INTO evento_auditoria
         (id, tipo, resultado, usuario_id, universidad_id, fecha, ip, detalle)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, tipo, resultado, usuario, universidad, fecha, ip, detalle],
    )
  }
}

beforeAll(async () => {
  admin = await new DataSource(opcionesDataSource()).initialize()
  await admin.query(`DROP DATABASE IF EXISTS "${BD_TEST}" WITH (FORCE)`)
  await admin.query(`CREATE DATABASE "${BD_TEST}"`)
  bd = await new DataSource(opcionesDataSource(BD_TEST)).initialize()
  await bd.runMigrations()
  await ejecutarSeed(bd, PASSWORD)
  const usuarios = await bd.query<
    { id: string; correo: string; universidad_id: string; dominio: string }[]
  >(
    `SELECT u.id, u.correo, u.universidad_id, un.dominio_correo AS dominio
       FROM usuario u JOIN universidad un ON un.id = u.universidad_id`,
  )
  for (const u of usuarios) {
    ids.set(u.correo, u.id)
    universidades.set(
      u.dominio.startsWith('norte')
        ? 'norte'
        : u.dominio.startsWith('sur')
          ? 'sur'
          : u.dominio,
      u.universidad_id,
    )
  }
  process.env.POSTGRES_DB = BD_TEST
  const modulo = await Test.createTestingModule({
    imports: [AppModule],
  }).compile()
  app = modulo.createNestApplication<INestApplication<App>>({ logger: false })
  configurarApp(app, { secretoOrigen: '' })
  await app.init()
  for (const correo of [DIRECTOR, PROFESOR, AYUDANTE, ALUMNO, ADMIN]) {
    await tokenDe(correo)
  }
  await sembrarEventos()
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

describe('GET /api/auditoria/eventos (SEG-05)', () => {
  it.each([
    ['profesor', PROFESOR],
    ['ayudante', AYUDANTE],
    ['alumno', ALUMNO],
    ['administrativo', ADMIN],
  ])('el %s recibe 403', async (_rol, correo) => {
    await pedir(correo, '', 403)
  })

  it('las opciones del filtro de universidad son solo del Director', async () => {
    const pedirUniversidades = (correo: string) =>
      request(app.getHttpServer())
        .get('/api/auditoria/universidades')
        .set('Authorization', `Bearer ${tokens.get(correo)}`)
    await pedirUniversidades(PROFESOR).expect(403)
    const respuesta = await pedirUniversidades(DIRECTOR).expect(200)
    expect(respuesta.body as unknown).toEqual(
      expect.arrayContaining([
        {
          id: universidades.get('norte'),
          nombre: expect.any(String) as string,
        },
        { id: universidades.get('sur'), nombre: expect.any(String) as string },
      ]),
    )
  })

  it('sin sesión responde 401', async () => {
    await request(app.getHttpServer()).get(RUTA).expect(401)
  })

  it('el Director ve los eventos de todas las universidades, del más reciente al más antiguo', async () => {
    const pagina = await comoDirector()
    expect(pagina).toMatchObject({ total: 8, pagina: 1, tamano: 25 })
    const fechas = pagina.eventos.map((e) => e.fecha)
    expect(fechas).toEqual([...fechas].sort().reverse())
    expect(fechas[0]).toBe(T(7))
    expect(fechas.at(-1)).toBe(T(1))
    // Con la misma fecha, el id mayor va primero.
    expect(pagina.eventos.slice(0, 2).map((e) => e.id)).toEqual([
      IDS_EMPATE[1],
      IDS_EMPATE[0],
    ])
    // Una universidad distinta a la suya también aparece.
    expect(
      pagina.eventos.some((e) => e.universidad?.nombre !== undefined),
    ).toBe(true)
    expect(
      new Set(pagina.eventos.map((e) => e.universidad?.id)).size,
    ).toBeGreaterThan(2)
  })

  it('la forma de cada evento no trae correos, hashes ni columnas internas', async () => {
    const { eventos } = await comoDirector()
    const evento = eventos.find((e) => e.tipo === 'CAMBIO_NOTA') as EventoAcceso
    expect(evento).toEqual({
      id: expect.any(String) as string,
      tipo: 'CAMBIO_NOTA',
      resultado: 'EXITOSO',
      fecha: T(3),
      ip: null,
      usuario: {
        id: idDe(PROFESOR),
        nombre: expect.any(String) as string,
        rol: 'PROFESOR',
      },
      universidad: {
        id: universidades.get('norte'),
        nombre: expect.any(String) as string,
      },
      detalle: { subtipo: 'APROBACION', origen: 'nota_cambio' },
    })
    const texto = JSON.stringify(eventos)
    expect(texto).not.toMatch(/password|hash|\$argon2|@norte|@sur/i)
  })

  it('un intento sin cuenta queda sin usuario ni universidad', async () => {
    const { eventos } = await comoDirector('?tipo=INICIO_SESION&hasta=' + T(2))
    expect(eventos.find((e) => e.fecha === T(2))).toMatchObject({
      resultado: 'FALLIDO',
      ip: '198.51.100.2',
      usuario: null,
      universidad: null,
    })
  })

  it('filtra por usuario', async () => {
    const { total, eventos } = await comoDirector(
      `?usuarioId=${idDe(PROFESOR)}`,
    )
    expect(total).toBe(2)
    expect(eventos.map((e) => e.tipo)).toEqual(['CIERRE_CURSO', 'CAMBIO_NOTA'])
  })

  it('filtra por universidad', async () => {
    const sur = await comoDirector(`?universidadId=${universidades.get('sur')}`)
    expect(sur.total).toBe(1)
    expect(sur.eventos[0].usuario?.id).toBe(idDe(ALUMNO_SUR))
    const norte = await comoDirector(
      `?universidadId=${universidades.get('norte')}`,
    )
    expect(norte.total).toBe(6)
  })

  it('filtra por tipo', async () => {
    const { total, eventos } = await comoDirector('?tipo=INICIO_SESION')
    expect(total).toBe(5)
    expect(new Set(eventos.map((e) => e.tipo))).toEqual(
      new Set(['INICIO_SESION']),
    )
  })

  it('filtra por rango de fechas, con los dos extremos incluidos', async () => {
    const { total, eventos } = await comoDirector(
      `?desde=${encodeURIComponent(T(3))}&hasta=${encodeURIComponent(T(5))}`,
    )
    expect(total).toBe(3)
    expect(eventos.map((e) => e.fecha)).toEqual([T(5), T(4), T(3)])
  })

  it('interpreta la zona horaria del filtro', async () => {
    // 12:00 UTC del día 3 es 09:00 en -03:00: ese mismo instante.
    const { total } = await comoDirector(
      `?desde=${encodeURIComponent('2026-10-03T09:00:00-03:00')}&hasta=${encodeURIComponent(T(3))}`,
    )
    expect(total).toBe(1)
  })

  it('combina los filtros', async () => {
    const { total, eventos } = await comoDirector(
      `?usuarioId=${idDe(ALUMNO)}&tipo=INICIO_SESION&desde=${encodeURIComponent(T(7))}`,
    )
    expect(total).toBe(2)
    expect(eventos.map((e) => e.resultado).sort()).toEqual([
      'BLOQUEADO',
      'EXITOSO',
    ])
  })

  it('un usuario o una universidad que no existe da una lista vacía', async () => {
    const id = '00000000-0000-4000-8000-0000000000aa'
    for (const filtro of [`usuarioId=${id}`, `universidadId=${id}`]) {
      expect(await comoDirector(`?${filtro}`)).toMatchObject({
        total: 0,
        eventos: [],
      })
    }
  })

  it('pagina sin repetir ni omitir eventos y con el total de todo el filtro', async () => {
    const todos = (await comoDirector('?tamano=100')).eventos.map((e) => e.id)
    const vistos: string[] = []
    for (const pagina of [1, 2, 3]) {
      const r = await comoDirector(`?tamano=3&pagina=${pagina}`)
      expect(r).toMatchObject({ total: 8, pagina, tamano: 3 })
      vistos.push(...r.eventos.map((e) => e.id))
    }
    expect(vistos).toEqual(todos)
    expect((await comoDirector('?tamano=3&pagina=4')).eventos).toEqual([])
    // Una página por evento: el desempate no cambia entre páginas.
    const unoPorUno = []
    for (const pagina of [1, 2]) {
      unoPorUno.push(
        ...(await comoDirector(`?tamano=1&pagina=${pagina}`)).eventos.map(
          (e) => e.id,
        ),
      )
    }
    expect(unoPorUno).toEqual([IDS_EMPATE[1], IDS_EMPATE[0]])
  })

  it.each([
    'tamano=101',
    'tamano=0',
    'tamano=abc',
    'pagina=0',
    'pagina=-1',
    'pagina=1.5',
    'tipo=OTRO',
    'usuarioId=no-es-uuid',
    'universidadId=1',
    'desde=2026-10-03',
    'desde=2026-10-03T12:00:00',
    'hasta=ayer',
    `desde=${encodeURIComponent(T(5))}&hasta=${encodeURIComponent(T(4))}`,
    'otro=1',
  ])('rechaza la consulta inválida %s con 400', async (consulta) => {
    await comoDirector(`?${consulta}`, 400)
  })

  it('no se puede modificar el registro desde la aplicación', async () => {
    const q = bd.createQueryRunner()
    await q.startTransaction()
    try {
      await q.query(`SET LOCAL ROLE ${ROL_APP}`)
      await q.query(`SELECT set_config('app.rol', 'DIRECTOR', true)`)
      for (const sql of [
        `UPDATE evento_auditoria SET resultado = 'EXITOSO'`,
        `DELETE FROM evento_auditoria`,
        `INSERT INTO evento_auditoria (tipo, resultado) VALUES ('CIERRE_CURSO', 'EXITOSO')`,
        `TRUNCATE evento_auditoria`,
      ]) {
        await q.query('SAVEPOINT s')
        await expect(q.query(sql)).rejects.toMatchObject({ code: '42501' })
        await q.query('ROLLBACK TO SAVEPOINT s')
      }
    } finally {
      await q.rollbackTransaction()
      await q.release()
    }
    expect((await comoDirector()).total).toBe(8)
  })

  it('la consulta no escribe: corre en una transacción de solo lectura', async () => {
    const antes = await bd.query<{ n: string }[]>(
      'SELECT count(*) AS n FROM evento_auditoria',
    )
    await comoDirector()
    const despues = await bd.query<{ n: string }[]>(
      'SELECT count(*) AS n FROM evento_auditoria',
    )
    expect(despues[0].n).toBe(antes[0].n)
  })
})
