import type {
  CrearEvaluacion,
  Evaluacion,
  EvaluacionesSeccion,
  Rol,
} from '@cursus/shared'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { DataSource, type QueryRunner } from 'typeorm'
import { AppModule } from '../../src/app.module.js'
import type { RespuestaLogin } from '../../src/auth/auth.controller.js'
import { configurarApp } from '../../src/config/configurar-app.js'
import {
  ROL_APP,
  type BaseDeDatos,
} from '../../src/database/base-de-datos.service.js'
import { opcionesDataSource } from '../../src/database/data-source.js'
import { ejecutarSeed } from '../../src/database/seed.js'
import { PonderacionesService } from '../../src/notas/ponderaciones.service.js'
import { vi } from 'vitest'

// NOT-01: base propia con el seed cargado, que se crea y se borra en cada
// ejecución. Todos los usuarios del seed comparten la contraseña.
const BD_TEST = `${process.env.POSTGRES_TEST_DB ?? 'cursus_test'}_evaluaciones`
const PASSWORD = 'contraseña-de-prueba'
const BD_ORIGINAL = process.env.POSTGRES_DB

// Códigos de error de PostgreSQL.
const CHECK = '23514'
const SIN_PERMISO = '42501'

const PROFESOR = 'profesor@norte.cursus.test'
const AYUDANTE = 'ayudante@norte.cursus.test'
const ALUMNO = 'alumno@norte.cursus.test'
const ADMIN_INGENIERIA = 'administrativo.ingenieria@norte.cursus.test'
const DIRECTOR = 'director@norte.cursus.test'
const DIRECTOR_SUR = 'director@sur.cursus.test'
const PROFESOR_SUR = 'profesor@sur.cursus.test'

let admin: DataSource
let bd: DataSource
let app: INestApplication<App>
const tokens = new Map<string, string>()

const secciones = { s1: '', s2: '' }
let profesorOtraSeccion = ''
let alumnoNoInscrito = ''
// Período del curso de ICC101 (YYYY-MM-DD).
const periodo = { inicio: '', termino: '' }
// Una fecha dentro del período, desplazada n días desde su inicio.
const dentro = (dias: number) => {
  const fecha = new Date(`${periodo.inicio}T00:00:00Z`)
  fecha.setUTCDate(fecha.getUTCDate() + dias)
  return fecha.toISOString().slice(0, 10)
}

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
async function listar(correo: string, seccionId: string, estado: number) {
  const token = await tokenDe(correo)
  const respuesta = await request(app.getHttpServer())
    .get(`/api/espacio/secciones/${seccionId}/evaluaciones`)
    .set('Authorization', `Bearer ${token}`)
    .expect(estado)
  return respuesta.body as EvaluacionesSeccion
}

async function crear(
  correo: string,
  seccionId: string,
  datos: Partial<CrearEvaluacion> & Record<string, unknown>,
  estado: number,
) {
  const token = await tokenDe(correo)
  const respuesta = await request(app.getHttpServer())
    .post(`/api/espacio/secciones/${seccionId}/evaluaciones`)
    .set('Authorization', `Bearer ${token}`)
    .send(datos)
    .expect(estado)
  return respuesta.body as Evaluacion & { message?: string | string[] }
}

const idDe = async (correo: string) =>
  (
    await bd.query<{ id: string }[]>(
      'SELECT id FROM usuario WHERE correo = $1',
      [correo],
    )
  )[0].id

const seccionDe = async (codigo: string, numero: number) =>
  (
    await bd.query<{ id: string }[]>(
      `SELECT s.id FROM seccion s JOIN curso c ON c.id = s.curso_id
        WHERE c.codigo = $1 AND s.numero = $2`,
      [codigo, numero],
    )
  )[0].id

// Consulta con el rol de la API, en una transacción que se revierte.
async function comoApp(
  sesion: { universidadId: string; rol: Rol },
  prueba: (q: QueryRunner) => Promise<void>,
) {
  const q = bd.createQueryRunner()
  await q.startTransaction()
  try {
    await q.query(`SET LOCAL ROLE ${ROL_APP}`)
    await q.query(
      `SELECT set_config('app.universidad_id', $1, true),
              set_config('app.rol', $2, true)`,
      [sesion.universidadId, sesion.rol],
    )
    await prueba(q)
  } finally {
    await q.rollbackTransaction()
    await q.release()
  }
}

const universidadDe = async (dominio: string) =>
  (
    await bd.query<{ id: string }[]>(
      'SELECT id FROM universidad WHERE dominio_correo = $1',
      [dominio],
    )
  )[0].id

// Escenario, armado como dueño de las tablas (sin RLS): ICC101 sección 1
// con el profesor, el ayudante y el alumno base; ICC101 sección 2 con otro
// profesor.
async function armarEscenario() {
  secciones.s1 = await seccionDe('ICC101', 1)
  secciones.s2 = await seccionDe('ICC101', 2)
  const correosDe = (rol: Rol) =>
    bd.query<{ correo: string }[]>(
      `SELECT u.correo FROM usuario u JOIN universidad un ON un.id = u.universidad_id
        WHERE u.rol = $1 AND un.dominio_correo = 'norte.cursus.test'
          AND u.correo NOT IN ($2, $3, $4) ORDER BY u.correo LIMIT 1`,
      [rol, PROFESOR, AYUDANTE, ALUMNO],
    )
  profesorOtraSeccion = (await correosDe('PROFESOR'))[0].correo
  alumnoNoInscrito = (await correosDe('ALUMNO'))[0].correo

  await bd.query('UPDATE seccion SET profesor_id = $2 WHERE id = $1', [
    secciones.s1,
    await idDe(PROFESOR),
  ])
  await bd.query('UPDATE seccion SET profesor_id = $2 WHERE id = $1', [
    secciones.s2,
    await idDe(profesorOtraSeccion),
  ])
  await bd.query(
    `INSERT INTO ayudante_seccion (universidad_id, seccion_id, usuario_id)
     SELECT universidad_id, $1, $2 FROM seccion WHERE id = $1`,
    [secciones.s1, await idDe(AYUDANTE)],
  )
  await bd.query(
    `INSERT INTO inscripcion (universidad_id, seccion_id, usuario_id)
     SELECT universidad_id, $1, $2 FROM seccion WHERE id = $1`,
    [secciones.s1, await idDe(ALUMNO)],
  )

  const [rango] = await bd.query<{ inicio: string; termino: string }[]>(
    `SELECT to_char(p.fecha_inicio, 'YYYY-MM-DD') AS inicio,
            to_char(p.fecha_termino, 'YYYY-MM-DD') AS termino
       FROM seccion s JOIN curso c ON c.id = s.curso_id
       JOIN periodo p ON p.id = c.periodo_id WHERE s.id = $1`,
    [secciones.s1],
  )
  Object.assign(periodo, rango)
}

beforeAll(async () => {
  admin = await new DataSource(opcionesDataSource()).initialize()
  await admin.query(`DROP DATABASE IF EXISTS "${BD_TEST}" WITH (FORCE)`)
  await admin.query(`CREATE DATABASE "${BD_TEST}"`)
  bd = await new DataSource(opcionesDataSource(BD_TEST)).initialize()
  await bd.runMigrations()
  await ejecutarSeed(bd, PASSWORD)
  await armarEscenario()

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

describe('NOT-02: condición transaccional de la futura nota final', () => {
  let numero = 10
  async function escenario(ponderaciones: number[]) {
    const [s] = await bd.query<{ id: string }[]>(
      `INSERT INTO seccion(universidad_id,curso_id,numero,profesor_id)
       SELECT universidad_id,curso_id,$2,$3 FROM seccion WHERE id=$1 RETURNING id`,
      [secciones.s1, numero++, await idDe(PROFESOR)],
    )
    for (const [n, ponderacion] of ponderaciones.entries()) {
      await crear(
        PROFESOR,
        s.id,
        { nombre: `Evaluación ${n}`, fecha: dentro(n), ponderacion },
        201,
      )
    }
    return s.id
  }
  const validar = async <T>(
    s: string,
    publicar: (conexion: Pick<BaseDeDatos, 'query'>) => Promise<T>,
  ) =>
    app.get(PonderacionesService).conNotaFinalValidada(
      {
        universidadId: await universidadDe('norte.cursus.test'),
        rol: 'PROFESOR',
      },
      await idDe(PROFESOR),
      s,
      publicar,
    )

  it.each([
    [[], 0, 100, 0],
    [[40, 59], 99, 1, 0],
    [[50, 51], 101, 0, 1],
    [[100, 100], 200, 0, 100],
  ])(
    'con ponderaciones %j rechaza publicar y no ejecuta la escritura',
    async (pesos, suma, faltan, sobran) => {
      const s = await escenario(pesos)
      const publicar = vi.fn(() => Promise.resolve('publicada'))
      await expect(validar(s, publicar)).rejects.toMatchObject({
        response: { statusCode: 409, sumaPonderaciones: suma, faltan, sobran },
      })
      expect(publicar).not.toHaveBeenCalled()
    },
  )
  it('con exactamente 100 permite la operación y excluye otra sección y evaluaciones archivadas', async () => {
    const s = await escenario([40, 60])
    await escenario([100])
    const archivada = await crear(
      PROFESOR,
      s,
      { nombre: 'Archivada', fecha: dentro(3), ponderacion: 50 },
      201,
    )
    await bd.query('UPDATE evaluacion SET archived_at=now() WHERE id=$1', [
      archivada.id,
    ])
    expect((await listar(PROFESOR, s, 200)).sumaPonderaciones).toBe(100)
    const publicar = vi.fn(async (conexion: Pick<BaseDeDatos, 'query'>) => {
      const [{ id }] = await conexion.query<{ id: string }>(
        'SELECT usuario_actual() AS id',
      )
      expect(id).toBe(await idDe(PROFESOR))
      return 'publicada'
    })
    expect(await validar(s, publicar)).toBe('publicada')
    expect(publicar).toHaveBeenCalledTimes(1)
  })
  it('revierte la operación entera si falla el callback', async () => {
    const s = await escenario([100])
    await expect(
      validar(s, async (conexion) => {
        await conexion.query(
          `INSERT INTO evaluacion(universidad_id,seccion_id,nombre,fecha,ponderacion,creada_por)
       SELECT universidad_id,id,'Operación a revertir',$2::date,10,$3 FROM seccion WHERE id=$1`,
          [s, dentro(4), await idDe(PROFESOR)],
        )
        throw new Error('fallo simulado')
      }),
    ).rejects.toThrow('fallo simulado')
    expect((await listar(PROFESOR, s, 200)).sumaPonderaciones).toBe(100)
  })
  it('la creación espera a que termine la publicación y la siguiente validación ve el total nuevo', async () => {
    const s = await escenario([100])
    await tokenDe(PROFESOR)
    let entro!: () => void
    const dentroDePublicacion = new Promise<void>((r) => {
      entro = r
    })
    let liberar!: () => void
    const continuar = new Promise<void>((r) => {
      liberar = r
    })
    const publicacion = validar(s, async () => {
      entro()
      await continuar
      return 'publicada'
    })
    await Promise.race([dentroDePublicacion, publicacion])
    const creacion = crear(
      PROFESOR,
      s,
      { nombre: 'Posterior', fecha: dentro(5), ponderacion: 10 },
      201,
    )
    try {
      await vi.waitFor(
        async () => {
          const [{ espera }] = await bd.query<
            { espera: boolean }[]
          >(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity
          WHERE datname=current_database() AND wait_event='advisory' AND pid<>pg_backend_pid()) AS espera`)
          expect(espera).toBe(true)
        },
        { timeout: 2000 },
      )
    } finally {
      liberar()
      await publicacion
      await creacion
    }
    await expect(validar(s, () => Promise.resolve())).rejects.toMatchObject({
      response: { sumaPonderaciones: 110, sobran: 10 },
    })
  })
  it.each<Rol>([
    'AYUDANTE',
    'ALUMNO',
    'DIRECTOR',
    'ADMINISTRATIVO',
    'SUPERADMIN',
  ])('%s no publica una nota final', async (rol) => {
    const publicar = vi.fn(() => Promise.resolve())
    await expect(
      app
        .get(PonderacionesService)
        .conNotaFinalValidada(
          { universidadId: await universidadDe('norte.cursus.test'), rol },
          await idDe(PROFESOR),
          secciones.s1,
          publicar,
        ),
    ).rejects.toMatchObject({ status: 403 })
    expect(publicar).not.toHaveBeenCalled()
  })
  it('niega otro profesor, otra universidad y sección archivada', async () => {
    const s = await escenario([100])
    const servicio = app.get(PonderacionesService)
    const norte = await universidadDe('norte.cursus.test')
    const publicar = vi.fn(() => Promise.resolve())
    await expect(
      servicio.conNotaFinalValidada(
        { universidadId: norte, rol: 'PROFESOR' },
        await idDe(profesorOtraSeccion),
        s,
        publicar,
      ),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      servicio.conNotaFinalValidada(
        {
          universidadId: await universidadDe('sur.cursus.test'),
          rol: 'PROFESOR',
        },
        await idDe(PROFESOR),
        s,
        publicar,
      ),
    ).rejects.toMatchObject({ status: 404 })
    await bd.query('UPDATE seccion SET archived_at=now() WHERE id=$1', [s])
    await expect(validar(s, publicar)).rejects.toMatchObject({ status: 404 })
    expect(publicar).not.toHaveBeenCalled()
  })
})

describe('PUT de una evaluación (NOT-03)', () => {
  const inicial = () => ({
    nombre: 'Control editable',
    fecha: dentro(4),
    ponderacion: 20,
  })
  const nuevos = () => ({
    nombre: 'Examen corregido',
    fecha: dentro(7),
    ponderacion: 35,
  })
  const ruta = (seccion: string, id: string) =>
    `/api/espacio/secciones/${seccion}/evaluaciones/${id}`
  const preparar = () => crear(PROFESOR, secciones.s1, inicial(), 201)
  async function editar(
    id: string,
    estado: number,
    datos = nuevos(),
    correo = PROFESOR,
    seccion = secciones.s1,
  ) {
    const token = await tokenDe(correo)
    return request(app.getHttpServer())
      .put(ruta(seccion, id))
      .set('Authorization', `Bearer ${token}`)
      .send(datos)
      .expect(estado)
  }
  const historial = (id: string) =>
    bd.query<
      {
        responsable_id: string
        fecha: Date
        anterior: CrearEvaluacion
        nuevo: CrearEvaluacion
      }[]
    >(
      'SELECT responsable_id, fecha, anterior, nuevo FROM evaluacion_cambio WHERE evaluacion_id=$1',
      [id],
    )
  async function ingresarNota(id: string, conexion: QueryRunner) {
    await conexion.query(
      `INSERT INTO nota (universidad_id,evaluacion_id,alumno_id,valor,propuesta_por)
       SELECT universidad_id,id,$2,5,$3 FROM evaluacion WHERE id=$1`,
      [id, await idDe(ALUMNO), await idDe(AYUDANTE)],
    )
  }

  it('actualiza los tres campos y la suma, y registra fecha, actor y valores reales una sola vez', async () => {
    const { id } = await preparar()
    const antes = (await listar(PROFESOR, secciones.s1, 200)).sumaPonderaciones
    const [{ momento }] = await bd.query<{ momento: Date }[]>(
      'SELECT clock_timestamp() AS momento',
    )
    const res = await editar(id, 200, {
      ...nuevos(),
      nombre: '  Examen   corregido ',
    })
    expect(res.body).toEqual({ id, ...nuevos() })
    await editar(id, 200)
    const lista = await listar(PROFESOR, secciones.s1, 200)
    expect(lista.sumaPonderaciones).toBe(antes + 15)
    expect(lista.evaluaciones.find((e) => e.id === id)).toEqual({
      id,
      ...nuevos(),
      tieneNotas: false,
    })
    const cambios = await historial(id)
    expect(cambios).toMatchObject([
      {
        responsable_id: await idDe(PROFESOR),
        anterior: inicial(),
        nuevo: nuevos(),
      },
    ])
    expect(cambios[0].fecha.getTime()).toBeGreaterThanOrEqual(momento.getTime())
    expect(
      (await listar(ALUMNO, secciones.s1, 200)).evaluaciones.find(
        (e) => e.id === id,
      ),
    ).not.toHaveProperty('tieneNotas')
    await bd.query('UPDATE evaluacion SET archived_at=now() WHERE id=$1', [id])
  })

  it('una propuesta guardada primero bloquea la edición, incluso si se archiva luego', async () => {
    const { id } = await preparar()
    const q = bd.createQueryRunner()
    await q.startTransaction()
    let edicion: Promise<unknown> | undefined
    try {
      await q.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `notas:${id}`,
      ])
      await ingresarNota(id, q)
      await tokenDe(PROFESOR)
      edicion = editar(id, 409).then((res) => {
        expect((res.body as { message: string }).message).toContain(
          'ya tiene notas ingresadas',
        )
      })
      await vi.waitFor(
        async () => {
          const [{ espera }] = await bd.query<
            { espera: boolean }[]
          >(`SELECT EXISTS (
          SELECT 1 FROM pg_stat_activity WHERE datname=current_database()
            AND wait_event='advisory' AND pid<>pg_backend_pid()
        ) AS espera`)
          expect(espera).toBe(true)
        },
        { timeout: 2000 },
      )
    } finally {
      await q.commitTransaction()
      await q.release()
      await edicion
    }
    const lista = await listar(PROFESOR, secciones.s1, 200)
    expect(lista.evaluaciones.find((e) => e.id === id)).toEqual({
      id,
      ...inicial(),
      tieneNotas: true,
    })
    await bd.query('UPDATE nota SET archived_at=now() WHERE evaluacion_id=$1', [
      id,
    ])
    await editar(id, 409)
    expect(await historial(id)).toEqual([])
    await bd.query('UPDATE evaluacion SET archived_at=now() WHERE id=$1', [id])
  })

  it('rechaza datos inválidos, otra sección y roles sin permiso sin dejar historial', async () => {
    const { id } = await preparar()
    await editar(id, 400, { ...nuevos(), ponderacion: 10.5 })
    await editar(id, 400, { ...nuevos(), fecha: '2030-01-01' })
    await editar(id, 403, nuevos(), AYUDANTE)
    await editar(id, 403, nuevos(), ALUMNO)
    await editar(id, 403, nuevos(), profesorOtraSeccion)
    await editar(id, 404, nuevos(), profesorOtraSeccion, secciones.s2)
    await editar(id, 404, nuevos(), PROFESOR_SUR)
    expect(await historial(id)).toEqual([])
    await bd.query('UPDATE evaluacion SET archived_at=now() WHERE id=$1', [id])
    await editar(id, 404)
  })

  it('RLS rechaza registrar un responsable distinto al profesor de sesión', async () => {
    const { id } = await preparar()
    const universidadId = await universidadDe('norte.cursus.test')
    await comoApp({ universidadId, rol: 'PROFESOR' }, async (q) => {
      await q.query("SELECT set_config('app.usuario_id', $1, true)", [
        await idDe(PROFESOR),
      ])
      await expect(
        q.query(
          `INSERT INTO evaluacion_cambio (universidad_id,evaluacion_id,responsable_id,anterior,nuevo)
         VALUES ($1,$2,$3,'{"ponderacion":20}','{"ponderacion":30}')`,
          [universidadId, id, await idDe(profesorOtraSeccion)],
        ),
      ).rejects.toMatchObject({ driverError: { code: SIN_PERMISO } })
    })
    await bd.query('UPDATE evaluacion SET archived_at=now() WHERE id=$1', [id])
  })
})

describe('POST /api/espacio/secciones/:id/evaluaciones (NOT-01)', () => {
  it('el profesor de la sección crea una evaluación y queda como creada_por', async () => {
    const creada = await crear(
      PROFESOR,
      secciones.s1,
      { nombre: '  Control   1 ', fecha: dentro(10), ponderacion: 20 },
      201,
    )

    expect(creada).toEqual({
      id: expect.any(String) as string,
      nombre: 'Control 1',
      fecha: dentro(10),
      ponderacion: 20,
    })
    const [fila] = await bd.query<{ creada_por: string; seccion_id: string }[]>(
      'SELECT creada_por, seccion_id FROM evaluacion WHERE id = $1',
      [creada.id],
    )
    expect(fila).toEqual({
      creada_por: await idDe(PROFESOR),
      seccion_id: secciones.s1,
    })
  })

  it('acepta los extremos de la ponderación (1 y 100) y las fechas límite del período', async () => {
    await crear(
      PROFESOR,
      secciones.s1,
      { nombre: 'Mínima', fecha: periodo.inicio, ponderacion: 1 },
      201,
    )
    await crear(
      PROFESOR,
      secciones.s1,
      { nombre: 'Máxima', fecha: periodo.termino, ponderacion: 100 },
      201,
    )
  })

  describe('validaciones: 400', () => {
    const valida = () => ({
      nombre: 'Solemne',
      fecha: dentro(20),
      ponderacion: 30,
    })

    it.each([
      ['sin nombre', { nombre: undefined }],
      ['sin fecha', { fecha: undefined }],
      ['sin ponderación', { ponderacion: undefined }],
      ['nombre vacío o solo espacios', { nombre: '   ' }],
      ['nombre de más de 100 caracteres', { nombre: 'x'.repeat(101) }],
      ['ponderación 0', { ponderacion: 0 }],
      ['ponderación 101', { ponderacion: 101 }],
      ['ponderación no entera', { ponderacion: 12.5 }],
      ['ponderación como texto', { ponderacion: '20' }],
      ['fecha con otro formato', { fecha: '15/09/2026' }],
      ['fecha inexistente', { fecha: '2026-02-30' }],
      ['un campo no esperado', { seccionId: secciones.s2 }],
      ['nombre con un carácter de control', { nombre: 'Control\u0000' }],
    ])('%s', async (_caso, cambio) => {
      await crear(PROFESOR, secciones.s1, { ...valida(), ...cambio }, 400)
    })

    it('fecha fuera del período del curso, con el rango en el mensaje', async () => {
      const antes = new Date(`${periodo.inicio}T00:00:00Z`)
      antes.setUTCDate(antes.getUTCDate() - 1)
      const respuesta = await crear(
        PROFESOR,
        secciones.s1,
        { ...valida(), fecha: antes.toISOString().slice(0, 10) },
        400,
      )
      expect(respuesta.message).toBe(
        `La fecha debe estar dentro del período del curso (del ${periodo.inicio} al ${periodo.termino})`,
      )
    })

    it('la base también rechaza una ponderación fuera de 1..100 (CHECK)', async () => {
      for (const ponderacion of [0, 101]) {
        await expect(
          bd.query(
            `INSERT INTO evaluacion (universidad_id, seccion_id, nombre, fecha, ponderacion, creada_por)
             SELECT universidad_id, id, 'Directo', $2::date, $3, $4 FROM seccion WHERE id = $1`,
            [secciones.s1, dentro(5), ponderacion, await idDe(PROFESOR)],
          ),
        ).rejects.toMatchObject({ driverError: { code: CHECK } })
      }
    })
  })

  describe('solo el profesor de la sección crea', () => {
    const datos = () => ({
      nombre: 'Intruso',
      fecha: dentro(3),
      ponderacion: 5,
    })

    it.each([
      ['un alumno inscrito', ALUMNO],
      ['un ayudante de la sección', AYUDANTE],
      ['el Administrativo de la facultad', ADMIN_INGENIERIA],
      ['el Director', DIRECTOR],
    ])('%s recibe 403', async (_caso, correo) => {
      await crear(correo, secciones.s1, datos(), 403)
    })

    it('un profesor de otra sección de la misma universidad recibe 403', async () => {
      // 403 del guard de ESP-06: no es integrante de la sección.
      await crear(profesorOtraSeccion, secciones.s1, datos(), 403)
    })

    it('un profesor de otra universidad recibe 404', async () => {
      // 404 del guard de ESP-06: con RLS, la sección no existe para él.
      await crear(PROFESOR_SUR, secciones.s1, datos(), 404)
    })

    it('ninguno de esos intentos guardó una evaluación', async () => {
      const [{ total }] = await bd.query<{ total: string }[]>(
        `SELECT count(*) AS total FROM evaluacion WHERE nombre = 'Intruso'`,
      )
      expect(Number(total)).toBe(0)
    })
  })
})

describe('GET /api/espacio/secciones/:id/evaluaciones (NOT-01)', () => {
  beforeAll(async () => {
    // Una evaluación archivada: no aparece ni suma.
    await bd.query(
      `INSERT INTO evaluacion (universidad_id, seccion_id, nombre, fecha, ponderacion, creada_por, archived_at)
       SELECT universidad_id, id, 'Archivada', $2::date, 50, $3, now() FROM seccion WHERE id = $1`,
      [secciones.s1, dentro(1), await idDe(PROFESOR)],
    )
  })

  it('lista las evaluaciones activas por fecha, con la suma de las ponderaciones', async () => {
    const lista = await listar(PROFESOR, secciones.s1, 200)

    // Creadas en el bloque anterior: Mínima (inicio del período), Control 1
    // (día 10) y Máxima (término del período).
    expect(lista.evaluaciones.map((e) => [e.nombre, e.fecha])).toEqual([
      ['Mínima', periodo.inicio],
      ['Control 1', dentro(10)],
      ['Máxima', periodo.termino],
    ])
    expect(lista.sumaPonderaciones).toBe(1 + 20 + 100)
  })

  it('una sección sin evaluaciones devuelve la lista vacía y suma 0', async () => {
    expect(await listar(profesorOtraSeccion, secciones.s2, 200)).toEqual({
      evaluaciones: [],
      sumaPonderaciones: 0,
    })
  })

  it.each([
    ['el ayudante', AYUDANTE],
    ['un alumno inscrito', ALUMNO],
    ['el Director de su universidad', DIRECTOR],
    ['el Director de otra universidad (solo lectura)', DIRECTOR_SUR],
  ])('%s la lee', async (_caso, correo) => {
    const lista = await listar(correo, secciones.s1, 200)
    expect(lista.evaluaciones).toHaveLength(3)
  })

  it.each([
    ['el Administrativo de la facultad', ADMIN_INGENIERIA, 403],
    ['un alumno no inscrito', () => alumnoNoInscrito, 403],
    ['un profesor de otra sección', () => profesorOtraSeccion, 403],
    ['un profesor de otra universidad', PROFESOR_SUR, 404],
  ])('%s no la lee (%#)', async (_caso, correo, estado) => {
    await listar(
      typeof correo === 'function' ? correo() : correo,
      secciones.s1,
      estado,
    )
  })
})

describe('RLS y sin DELETE (NOT-01)', () => {
  it('desde otra universidad no se ven las evaluaciones de Norte', async () => {
    await comoApp(
      {
        universidadId: await universidadDe('sur.cursus.test'),
        rol: 'PROFESOR',
      },
      async (q) => {
        expect(
          await q.query(`SELECT id FROM evaluacion WHERE seccion_id = $1`, [
            secciones.s1,
          ]),
        ).toEqual([])
      },
    )
  })

  it('no se puede insertar en otra universidad ni con un rol distinto de profesor', async () => {
    const norte = await universidadDe('norte.cursus.test')
    const sur = await universidadDe('sur.cursus.test')
    const creadaPor = await idDe(PROFESOR)
    const insertar = (q: QueryRunner) =>
      q.query(
        `INSERT INTO evaluacion (universidad_id, seccion_id, nombre, fecha, ponderacion, creada_por)
         VALUES ($1, $2, 'RLS', $3::date, 10, $4)`,
        [norte, secciones.s1, dentro(2), creadaPor],
      )

    for (const sesion of [
      { universidadId: sur, rol: 'PROFESOR' as const },
      { universidadId: norte, rol: 'AYUDANTE' as const },
      { universidadId: norte, rol: 'ADMINISTRATIVO' as const },
      { universidadId: norte, rol: 'DIRECTOR' as const },
    ]) {
      await comoApp(sesion, async (q) => {
        await expect(insertar(q)).rejects.toMatchObject({
          driverError: { code: SIN_PERMISO },
        })
      })
    }
  })

  it('cursus_app no tiene DELETE sobre evaluacion', async () => {
    const [{ puede }] = await bd.query<{ puede: boolean }[]>(
      `SELECT has_table_privilege($1, 'evaluacion', 'DELETE') AS puede`,
      [ROL_APP],
    )
    expect(puede).toBe(false)
  })

  it('no hay ruta para borrar evaluaciones', async () => {
    const token = await tokenDe(PROFESOR)
    const [{ id }] = await bd.query<{ id: string }[]>(
      `SELECT id FROM evaluacion WHERE archived_at IS NULL LIMIT 1`,
    )
    await request(app.getHttpServer())
      .delete(`/api/espacio/secciones/${secciones.s1}/evaluaciones/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404)
  })
})
