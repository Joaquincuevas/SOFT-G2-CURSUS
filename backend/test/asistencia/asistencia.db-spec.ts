import type {
  AsistenciaClase,
  AsistenciaPropia,
  CambioAsistencia,
  ErrorListaAsistencia,
  Rol,
  ResumenAsistenciaSeccion,
} from '@cursus/shared'
import { CrearAsistenciaCambio1792690000000 } from '../../src/database/migrations/1792690000000-CrearAsistenciaCambio.js'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { DataSource, type QueryRunner } from 'typeorm'
import { AppModule } from '../../src/app.module.js'
import type { RespuestaLogin } from '../../src/auth/auth.controller.js'
import { configurarApp } from '../../src/config/configurar-app.js'
import { ROL_APP } from '../../src/database/base-de-datos.service.js'
import { opcionesDataSource } from '../../src/database/data-source.js'
import { ejecutarSeed } from '../../src/database/seed.js'

// ASI-02: base propia con el seed cargado, que se crea y se borra en cada
// ejecución. Todos los usuarios del seed comparten la contraseña.
const BD_TEST = `${process.env.POSTGRES_TEST_DB ?? 'cursus_test'}_asistencia`
const PASSWORD = 'contraseña-de-prueba'
// Hash con formato válido; los alumnos creados aquí no inician sesión.
const HASH = '$2b$10$abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOP'
const BD_ORIGINAL = process.env.POSTGRES_DB
const SIN_PERMISO = '42501'
const NO_EXISTE = '00000000-0000-4000-8000-000000000000'

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

const secciones = { s1: '', s2: '', sinAlumnos: '' }
// Clases de s1 (c1..c4 y una archivada), de s2 y de la sección sin alumnos.
const clases = {
  c1: '',
  c2: '',
  c3: '',
  c4: '',
  archivada: '',
  otraSeccion: '',
  sinAlumnos: '',
}
// Alumnos activos de s1, en orden alfabético, y uno con la inscripción
// archivada (no forma parte de la lista).
const alumnos = { ana: '', base: '', zoe: '', retirado: '', noInscrito: '' }
let profesorOtraSeccion = ''

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

const ruta = (seccionId: string, claseId: string) =>
  `/api/espacio/secciones/${seccionId}/clases/${claseId}/asistencia`

// El token se pide antes de crear la petición: si no, supertest cierra el
// servidor de una petición al terminar la otra.
async function leer(
  correo: string,
  claseId: string,
  estado: number,
  seccionId = secciones.s1,
) {
  const token = await tokenDe(correo)
  const respuesta = await request(app.getHttpServer())
    .get(ruta(seccionId, claseId))
    .set('Authorization', `Bearer ${token}`)
    .expect(estado)
  return respuesta.body as AsistenciaClase
}

async function guardar(
  correo: string,
  claseId: string,
  cuerpo: unknown,
  estado: number,
  seccionId = secciones.s1,
) {
  const token = await tokenDe(correo)
  const respuesta = await request(app.getHttpServer())
    .post(ruta(seccionId, claseId))
    .set('Authorization', `Bearer ${token}`)
    .send(cuerpo as object)
    .expect(estado)
  return respuesta.body as AsistenciaClase &
    ErrorListaAsistencia & { message: string | string[] }
}

// Una marca por alumno activo de s1: presentes todos salvo los indicados.
const marcasDe = (ausentes: string[] = []) => ({
  marcas: [alumnos.ana, alumnos.base, alumnos.zoe].map((alumnoId) => ({
    alumnoId,
    presente: !ausentes.includes(alumnoId),
  })),
})

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

const universidadDe = async (dominio: string) =>
  (
    await bd.query<{ id: string }[]>(
      'SELECT id FROM universidad WHERE dominio_correo = $1',
      [dominio],
    )
  )[0].id

async function crearAlumno(seccionId: string, nombre: string) {
  const correo = `${nombre
    .normalize('NFD')
    .replace(/[^a-zA-Z]/g, '')
    .toLowerCase()}@norte.cursus.test`
  const [{ id }] = await bd.query<{ id: string }[]>(
    `INSERT INTO usuario (universidad_id, nombre, correo, password_hash, rol)
     SELECT universidad_id, $2, $3, $4, 'ALUMNO' FROM seccion WHERE id = $1
     RETURNING id`,
    [seccionId, nombre, correo, HASH],
  )
  return id
}

const inscribir = (seccionId: string, alumnoId: string) =>
  bd.query<unknown>(
    `INSERT INTO inscripcion (universidad_id, seccion_id, usuario_id)
     SELECT universidad_id, $1, $2 FROM seccion WHERE id = $1`,
    [seccionId, alumnoId],
  )

const archivarInscripcion = async (seccionId: string, alumnoId: string) =>
  bd.query<unknown>(
    `UPDATE inscripcion SET archived_at = now(), archivada_por = $3
      WHERE seccion_id = $1 AND usuario_id = $2 AND archived_at IS NULL`,
    [seccionId, alumnoId, await idDe(ADMIN_INGENIERIA)],
  )

// Una clase de la sección en la n-ésima semana del período (sin depender
// del horario: ASI-01 ya cubre cómo se registra).
async function crearClase(
  seccionId: string,
  semana: number,
  archivada = false,
) {
  const [{ id }] = await bd.query<{ id: string }[]>(
    `INSERT INTO clase (universidad_id, seccion_id, fecha, inicio, termino, sala, creada_por, archived_at)
     SELECT s.universidad_id, s.id, p.fecha_inicio + $2 * 7, '08:30', '10:00',
            'Sala A-101', COALESCE(s.profesor_id, $3), ${archivada ? 'now()' : 'NULL'}
       FROM seccion s JOIN curso c ON c.id = s.curso_id
       JOIN periodo p ON p.id = c.periodo_id
      WHERE s.id = $1
     RETURNING id`,
    [seccionId, semana, await idDe(PROFESOR)],
  )
  return id
}

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

// Escenario, armado como dueño de las tablas (sin RLS).
async function armarEscenario() {
  secciones.s1 = await seccionDe('ICC101', 1)
  secciones.s2 = await seccionDe('ICC101', 2)
  secciones.sinAlumnos = await seccionDe('ICC201', 1)
  const [{ correo }] = await bd.query<{ correo: string }[]>(
    `SELECT u.correo FROM usuario u JOIN universidad un ON un.id = u.universidad_id
      WHERE u.rol = 'PROFESOR' AND un.dominio_correo = 'norte.cursus.test'
        AND u.correo <> $1 ORDER BY u.correo LIMIT 1`,
    [PROFESOR],
  )
  profesorOtraSeccion = correo

  const asignar = async (seccionId: string, profesor: string) =>
    bd.query<unknown>('UPDATE seccion SET profesor_id = $2 WHERE id = $1', [
      seccionId,
      await idDe(profesor),
    ])
  await asignar(secciones.s1, PROFESOR)
  await asignar(secciones.s2, profesorOtraSeccion)
  await asignar(secciones.sinAlumnos, PROFESOR)
  await bd.query(
    `INSERT INTO ayudante_seccion (universidad_id, seccion_id, usuario_id)
     SELECT universidad_id, $1, $2 FROM seccion WHERE id = $1`,
    [secciones.s1, await idDe(AYUDANTE)],
  )

  alumnos.base = await idDe(ALUMNO)
  alumnos.ana = await crearAlumno(secciones.s1, 'Ana Ávila')
  alumnos.zoe = await crearAlumno(secciones.s1, 'Zoe Ruiz')
  alumnos.retirado = await crearAlumno(secciones.s1, 'Bruno Retirado')
  alumnos.noInscrito = await crearAlumno(secciones.s1, 'Nadie Inscrito')
  for (const id of [alumnos.base, alumnos.ana, alumnos.zoe, alumnos.retirado]) {
    await inscribir(secciones.s1, id)
  }
  await archivarInscripcion(secciones.s1, alumnos.retirado)

  clases.c1 = await crearClase(secciones.s1, 1)
  clases.c2 = await crearClase(secciones.s1, 2)
  clases.c3 = await crearClase(secciones.s1, 3)
  clases.c4 = await crearClase(secciones.s1, 4)
  clases.archivada = await crearClase(secciones.s1, 5, true)
  clases.otraSeccion = await crearClase(secciones.s2, 1)
  clases.sinAlumnos = await crearClase(secciones.sinAlumnos, 1)
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

describe('GET .../clases/:claseId/asistencia (ASI-02)', () => {
  it('sin asistencia: los alumnos activos, en orden y sin marca ni correo', async () => {
    const asistencia = await leer(PROFESOR, clases.c1, 200)

    expect(asistencia.registrada).toBeNull()
    expect(asistencia.clase).toMatchObject({
      id: clases.c1,
      inicio: '08:30',
      termino: '10:00',
      sala: 'Sala A-101',
    })
    expect(asistencia.alumnos).toEqual([
      { id: alumnos.base, nombre: 'Alumno Norte', presente: null },
      { id: alumnos.ana, nombre: 'Ana Ávila', presente: null },
      { id: alumnos.zoe, nombre: 'Zoe Ruiz', presente: null },
    ])
  })

  it.each([
    ['el ayudante', AYUDANTE],
    ['el Director de su universidad', DIRECTOR],
    ['el Director de otra universidad (solo lectura)', DIRECTOR_SUR],
  ])('%s la lee', async (_caso, correo) => {
    expect((await leer(correo, clases.c1, 200)).alumnos).toHaveLength(3)
  })

  it.each([
    ['un alumno inscrito (ve la suya en ASI-06)', ALUMNO, 403],
    ['el Administrativo de la facultad', ADMIN_INGENIERIA, 403],
    ['un profesor de otra sección', () => profesorOtraSeccion, 403],
    ['un profesor de otra universidad', PROFESOR_SUR, 404],
  ])('%s no la lee (%#)', async (_caso, correo, estado) => {
    await leer(
      typeof correo === 'function' ? correo() : correo,
      clases.c1,
      estado,
    )
  })

  it.each([
    ['de otra sección', () => clases.otraSeccion],
    ['archivada', () => clases.archivada],
    ['que no existe', () => NO_EXISTE],
  ])('una clase %s responde 404', async (_caso, clase) => {
    await leer(PROFESOR, clase(), 404)
  })
})

describe('POST .../clases/:claseId/asistencia (ASI-02)', () => {
  it('el profesor registra la asistencia: con fecha y profesor', async () => {
    const guardada = await guardar(
      PROFESOR,
      clases.c1,
      marcasDe([alumnos.zoe]),
      201,
    )

    expect(guardada.registrada).toEqual({
      por: { id: await idDe(PROFESOR), nombre: 'Profesor Norte' },
      en: expect.any(String) as string,
    })
    expect(new Date(guardada.registrada!.en).getTime()).not.toBeNaN()
    expect(guardada.alumnos).toEqual([
      { id: alumnos.base, nombre: 'Alumno Norte', presente: true },
      { id: alumnos.ana, nombre: 'Ana Ávila', presente: true },
      { id: alumnos.zoe, nombre: 'Zoe Ruiz', presente: false },
    ])

    const filas = await bd.query<
      { alumno_id: string; presente: boolean; registrada_por: string }[]
    >(
      `SELECT alumno_id, presente, registrada_por FROM asistencia
        WHERE clase_id = $1 ORDER BY alumno_id`,
      [clases.c1],
    )
    expect(filas).toHaveLength(3)
    expect(new Set(filas.map((f) => f.registrada_por))).toEqual(
      new Set([await idDe(PROFESOR)]),
    )

    // La lectura muestra lo mismo.
    expect(await leer(AYUDANTE, clases.c1, 200)).toEqual(guardada)
  })

  it('volver a guardar la misma clase responde 409 (corregir es ASI-04)', async () => {
    const respuesta = await guardar(PROFESOR, clases.c1, marcasDe(), 409)
    expect(respuesta.message).toBe(
      'La asistencia de esta clase ya está registrada; corregirla es otra acción',
    )
  })

  describe('la lista debe coincidir con los alumnos activos: 400 con el detalle', () => {
    it('falta un alumno', async () => {
      const cuerpo = marcasDe()
      cuerpo.marcas = cuerpo.marcas.filter((m) => m.alumnoId !== alumnos.ana)

      const respuesta = await guardar(PROFESOR, clases.c2, cuerpo, 400)
      expect(respuesta).toMatchObject({
        faltantes: [alumnos.ana],
        sobrantes: [],
        repetidos: [],
      })
    })

    it('sobra un alumno no inscrito o con la inscripción archivada', async () => {
      const cuerpo = marcasDe()
      cuerpo.marcas.push(
        { alumnoId: alumnos.noInscrito, presente: true },
        { alumnoId: alumnos.retirado, presente: false },
      )

      const respuesta = await guardar(PROFESOR, clases.c2, cuerpo, 400)
      expect(respuesta).toMatchObject({ faltantes: [], repetidos: [] })
      expect(new Set(respuesta.sobrantes)).toEqual(
        new Set([alumnos.noInscrito, alumnos.retirado]),
      )
    })

    it('un alumno repetido', async () => {
      const cuerpo = marcasDe()
      cuerpo.marcas.push({ alumnoId: alumnos.base, presente: false })

      const respuesta = await guardar(PROFESOR, clases.c2, cuerpo, 400)
      expect(respuesta).toMatchObject({
        faltantes: [],
        sobrantes: [],
        repetidos: [alumnos.base],
      })
    })

    it('una lista vacía: faltan todos', async () => {
      const respuesta = await guardar(PROFESOR, clases.c2, { marcas: [] }, 400)
      expect(new Set(respuesta.faltantes)).toEqual(
        new Set([alumnos.base, alumnos.ana, alumnos.zoe]),
      )
    })

    it('ninguno de esos intentos guardó filas', async () => {
      const [{ n }] = await bd.query<{ n: string }[]>(
        'SELECT count(*) AS n FROM asistencia WHERE clase_id = $1',
        [clases.c2],
      )
      expect(Number(n)).toBe(0)
    })
  })

  it('una sección sin alumnos inscritos responde 400', async () => {
    const respuesta = await guardar(
      PROFESOR,
      clases.sinAlumnos,
      { marcas: [] },
      400,
      secciones.sinAlumnos,
    )
    expect(respuesta.message).toBe('La sección no tiene alumnos inscritos')
  })

  it.each([
    ['sin marcas', {}],
    ['marcas que no son lista', { marcas: 'todos' }],
    [
      'presente que no es booleano',
      { marcas: [{ alumnoId: NO_EXISTE, presente: 'sí' }] },
    ],
    [
      'alumnoId que no es UUID',
      { marcas: [{ alumnoId: 'x', presente: true }] },
    ],
    ['un campo no esperado', { ...marcasDe(), clase: 'otra' }],
  ])('el cuerpo inválido responde 400: %s', async (_caso, cuerpo) => {
    await guardar(PROFESOR, clases.c2, cuerpo, 400)
  })

  it.each([
    ['de otra sección', () => clases.otraSeccion],
    ['archivada', () => clases.archivada],
    ['que no existe', () => NO_EXISTE],
  ])('una clase %s responde 404', async (_caso, clase) => {
    await guardar(PROFESOR, clase(), marcasDe(), 404)
  })

  describe('solo el profesor de la sección guarda', () => {
    it.each([
      ['un alumno inscrito', ALUMNO],
      ['un ayudante de la sección', AYUDANTE],
      ['el Administrativo de la facultad', ADMIN_INGENIERIA],
      ['el Director', DIRECTOR],
    ])('%s recibe 403', async (_caso, correo) => {
      await guardar(correo, clases.c3, marcasDe(), 403)
    })

    it('un profesor de otra sección recibe 403 (guard de ESP-06)', async () => {
      await guardar(profesorOtraSeccion, clases.c3, marcasDe(), 403)
    })

    it('un profesor de otra universidad recibe 404 (guard de ESP-06)', async () => {
      await guardar(PROFESOR_SUR, clases.c3, marcasDe(), 404)
    })

    it('ninguno de esos intentos guardó filas', async () => {
      const [{ n }] = await bd.query<{ n: string }[]>(
        'SELECT count(*) AS n FROM asistencia WHERE clase_id = $1',
        [clases.c3],
      )
      expect(Number(n)).toBe(0)
    })
  })

  it('acepta los UUID en mayúsculas', async () => {
    const clase = await crearClase(secciones.s1, 6)
    const cuerpo = marcasDe()
    cuerpo.marcas = cuerpo.marcas.map((m) => ({
      ...m,
      alumnoId: m.alumnoId.toUpperCase(),
    }))
    await guardar(PROFESOR, clase, cuerpo, 201)
  })

  it('dos guardados simultáneos de la misma clase: uno 201 y el otro 409', async () => {
    const clase = await crearClase(secciones.s1, 7)
    const token = await tokenDe(PROFESOR)
    const enviar = () =>
      request(app.getHttpServer())
        .post(ruta(secciones.s1, clase))
        .set('Authorization', `Bearer ${token}`)
        .send(marcasDe())
    const estados = (await Promise.all([enviar(), enviar()]))
      .map((r) => r.status)
      .sort()
    expect(estados).toEqual([201, 409])
    const [{ n }] = await bd.query<{ n: string }[]>(
      'SELECT count(*) AS n FROM asistencia WHERE clase_id = $1',
      [clase],
    )
    expect(Number(n)).toBe(3)
  })

  it('una clase registrada sigue mostrando las filas guardadas aunque un alumno se retire', async () => {
    await guardar(PROFESOR, clases.c4, marcasDe([alumnos.base]), 201)
    // El alumno base deja la sección después de registrar.
    await archivarInscripcion(secciones.s1, alumnos.base)
    try {
      // La clase registrada lo sigue mostrando, con su marca.
      const registrada = await leer(PROFESOR, clases.c4, 200)
      expect(registrada.alumnos.map((a) => [a.nombre, a.presente])).toEqual([
        ['Alumno Norte', false],
        ['Ana Ávila', true],
        ['Zoe Ruiz', true],
      ])
      // Una clase sin registrar ya no lo incluye.
      const pendiente = await leer(PROFESOR, clases.c3, 200)
      expect(pendiente.alumnos.map((a) => a.nombre)).toEqual([
        'Ana Ávila',
        'Zoe Ruiz',
      ])
    } finally {
      await inscribir(secciones.s1, alumnos.base)
    }
  })
})

describe('RLS y sin DELETE (ASI-02)', () => {
  it('desde otra universidad no se ve la asistencia de Norte', async () => {
    // Hay asistencia guardada en Norte (si no, el test no probaría nada).
    const [{ n }] = await bd.query<{ n: string }[]>(
      'SELECT count(*) AS n FROM asistencia',
    )
    expect(Number(n)).toBeGreaterThan(0)
    await comoApp(
      {
        universidadId: await universidadDe('sur.cursus.test'),
        rol: 'PROFESOR',
      },
      async (q) => {
        expect(await q.query('SELECT id FROM asistencia')).toEqual([])
      },
    )
  })

  it('no se puede insertar en otra universidad ni con un rol distinto de profesor', async () => {
    const norte = await universidadDe('norte.cursus.test')
    const sur = await universidadDe('sur.cursus.test')
    const profesor = await idDe(PROFESOR)
    const insertar = (q: QueryRunner) =>
      q.query(
        `INSERT INTO asistencia (universidad_id, clase_id, alumno_id, presente, registrada_por)
         VALUES ($1, $2, $3, true, $4)`,
        [norte, clases.c3, alumnos.ana, profesor],
      )
    // Control positivo: el profesor de Norte sí puede insertar.
    await comoApp({ universidadId: norte, rol: 'PROFESOR' }, async (q) => {
      await expect(insertar(q)).resolves.toBeDefined()
    })
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

  it('cursus_app no tiene DELETE sobre asistencia', async () => {
    const [{ puede }] = await bd.query<{ puede: boolean }[]>(
      `SELECT has_table_privilege($1, 'asistencia', 'DELETE') AS puede`,
      [ROL_APP],
    )
    expect(puede).toBe(false)
  })

  it('no hay ruta para borrar la asistencia', async () => {
    const token = await tokenDe(PROFESOR)
    await request(app.getHttpServer())
      .delete(ruta(secciones.s1, clases.c1))
      .set('Authorization', `Bearer ${token}`)
      .expect(404)
  })
})

describe('ASI-04: correcciones trazables', () => {
  let semana = 10
  const cambio = {
    anterior: true,
    presente: false,
    motivo: 'Llegó después de cerrar la lista',
  }
  async function preparar() {
    const clase = await crearClase(secciones.s1, semana++)
    const original = await guardar(PROFESOR, clase, marcasDe(), 201)
    return { clase, original }
  }
  async function corregir(
    clase: string,
    body: object = cambio,
    estado = 200,
    correo = PROFESOR,
    alumnoId = alumnos.base,
  ) {
    const token = await tokenDe(correo)
    return request(app.getHttpServer())
      .patch(`${ruta(secciones.s1, clase)}/alumnos/${alumnoId}`)
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(estado)
  }
  async function historial(
    clase: string,
    estado = 200,
    correo = PROFESOR,
    alumnoId = alumnos.base,
  ) {
    const token = await tokenDe(correo)
    const res = await request(app.getHttpServer())
      .get(`${ruta(secciones.s1, clase)}/alumnos/${alumnoId}/historial`)
      .set('Authorization', `Bearer ${token}`)
      .expect(estado)
    return res.body as CambioAsistencia[]
  }
  async function propia(
    seccionId = secciones.s1,
    estado = 200,
    extra = '',
    correo = ALUMNO,
  ) {
    const token = await tokenDe(correo)
    const res = await request(app.getHttpServer())
      .get(`/api/espacio/secciones/${seccionId}/mi-asistencia${extra}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(estado)
    return res.body as AsistenciaPropia[]
  }

  it('corrige en ambos sentidos, conserva el registro original y guarda profesor, motivo y fecha', async () => {
    const { clase, original } = await preparar()
    expect(await historial(clase)).toEqual([])
    // La fecha la produce PostgreSQL: comparar con su reloj evita depender
    // del desfase entre Docker Desktop y el equipo que ejecuta Vitest.
    const [{ ahora: antes }] = await bd.query<{ ahora: Date }[]>(
      'SELECT clock_timestamp() AS ahora',
    )
    const corregida = await corregir(clase, {
      ...cambio,
      motivo: '  Justificación revisada  ',
    })
    expect(
      (corregida.body as AsistenciaClase).alumnos.find(
        (a) => a.id === alumnos.base,
      )?.presente,
    ).toBe(false)
    expect((corregida.body as AsistenciaClase).registrada).toEqual(
      original.registrada,
    )
    await corregir(clase, {
      anterior: false,
      presente: true,
      motivo: 'Se confirmó su presencia',
    })
    const eventos = await historial(clase)
    expect(eventos).toHaveLength(2)
    expect(eventos[0]).toMatchObject({
      anterior: true,
      nuevo: false,
      motivo: 'Justificación revisada',
      profesor: { id: await idDe(PROFESOR), nombre: 'Profesor Norte' },
    })
    expect(eventos[1]).toMatchObject({
      anterior: false,
      nuevo: true,
      motivo: 'Se confirmó su presencia',
    })
    const [{ ahora: despues }] = await bd.query<{ ahora: Date }[]>(
      'SELECT clock_timestamp() AS ahora',
    )
    for (const h of eventos) {
      expect(Date.parse(h.fecha)).toBeGreaterThanOrEqual(antes.getTime())
      expect(Date.parse(h.fecha)).toBeLessThanOrEqual(despues.getTime())
    }
    expect((await leer(PROFESOR, clase, 200)).alumnos).toEqual(original.alumnos)
  })

  it('el alumno ve su marca corregida sin recibir otras marcas ni el historial o motivo', async () => {
    const { clase } = await preparar()
    expect((await propia()).find((a) => a.clase.id === clase)?.presente).toBe(
      true,
    )
    await corregir(clase)
    const marcas = await propia(
      secciones.s1,
      200,
      `?alumnoId=${alumnos.ana}&universidadId=${await universidadDe('sur.cursus.test')}`,
    )
    const marca = marcas.find((a) => a.clase.id === clase)
    expect(marca).toEqual({
      clase: (await leer(PROFESOR, clase, 200)).clase,
      presente: false,
    })
    expect(JSON.stringify(marcas)).not.toContain(cambio.motivo)
    await historial(clase, 403, ALUMNO)
  })

  it('un guardado sin cambio no inventa un evento y un formulario desactualizado responde 409', async () => {
    const { clase } = await preparar()
    await corregir(clase, { ...cambio, presente: true })
    expect(await historial(clase)).toEqual([])
    await corregir(clase)
    await corregir(clase, cambio, 409)
    expect(await historial(clase)).toHaveLength(1)
  })

  it('dos correcciones concurrentes de la misma versión producen un cambio y un conflicto', async () => {
    const { clase } = await preparar()
    const token = await tokenDe(PROFESOR)
    const enviar = (motivo: string) =>
      request(app.getHttpServer())
        .patch(`${ruta(secciones.s1, clase)}/alumnos/${alumnos.base}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ ...cambio, motivo })
    const res = await Promise.all([
      enviar('Revisión primera'),
      enviar('Revisión segunda'),
    ])
    expect(res.map((r) => r.status).sort()).toEqual([200, 409])
    expect(await historial(clase)).toHaveLength(1)
    expect(
      (await leer(PROFESOR, clase, 200)).alumnos.find(
        (a) => a.id === alumnos.base,
      )?.presente,
    ).toBe(false)
  })

  it.each([
    {},
    { presente: false, motivo: 'M' },
    { ...cambio, anterior: 'true' },
    { ...cambio, presente: 'false' },
    { ...cambio, motivo: '' },
    { ...cambio, motivo: ' \t\n ' },
    { ...cambio, motivo: null },
    { ...cambio, motivo: 'm'.repeat(501) },
    { ...cambio, motivo: 'a\u0001b' },
    { ...cambio, profesorId: NO_EXISTE },
    { ...cambio, universidadId: NO_EXISTE },
  ])(
    'rechaza el body inválido sin modificar marcas ni auditoría: %j',
    async (body) => {
      const { clase, original } = await preparar()
      await corregir(clase, body, 400)
      expect(await leer(PROFESOR, clase, 200)).toEqual(original)
      expect(await historial(clase)).toEqual([])
    },
  )

  it.each([AYUDANTE, ALUMNO, ADMIN_INGENIERIA, DIRECTOR])(
    '%s no corrige ni accede al historial',
    async (correo) => {
      const { clase } = await preparar()
      await corregir(clase, cambio, 403, correo)
      await historial(clase, 403, correo)
      expect(await historial(clase)).toEqual([])
    },
  )

  it('rechaza al profesor de otra sección o universidad y a quien no es alumno en lectura propia', async () => {
    const { clase } = await preparar()
    await corregir(clase, cambio, 403, profesorOtraSeccion)
    await corregir(clase, cambio, 404, PROFESOR_SUR)
    await historial(clase, 403, profesorOtraSeccion)
    await historial(clase, 404, PROFESOR_SUR)
    await propia(secciones.s2, 403)
    await propia(secciones.s1, 403, '', PROFESOR)
  })

  it('no corrige una marca inexistente, clase pendiente, de otra sección o archivada', async () => {
    await corregir(NO_EXISTE, cambio, 404)
    await corregir(clases.otraSeccion, cambio, 404)
    await corregir(clases.archivada, cambio, 404)
    const { clase } = await preparar()
    await corregir(clase, cambio, 404, PROFESOR, alumnos.noInscrito)
    const pendiente = await crearClase(secciones.s1, semana++)
    await corregir(pendiente, cambio, 404)
    await bd.query('UPDATE clase SET archived_at = now() WHERE id = $1', [
      clase,
    ])
    await corregir(clase, cambio, 404)
  })

  it('permite corregir una marca histórica si el alumno ya no está inscrito, pero no le da acceso al espacio', async () => {
    const { clase } = await preparar()
    await archivarInscripcion(secciones.s1, alumnos.base)
    try {
      await corregir(clase)
      expect(await historial(clase)).toHaveLength(1)
      await propia(secciones.s1, 403)
    } finally {
      await inscribir(secciones.s1, alumnos.base)
    }
  })

  it('un fallo de auditoría revierte también la marca', async () => {
    const { clase, original } = await preparar()
    await bd.query(
      `CREATE FUNCTION fallar_asistencia_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fallo simulado'; END; $$`,
    )
    await bd.query(
      'CREATE TRIGGER tg_fallar_asistencia_test BEFORE INSERT ON asistencia_cambio FOR EACH ROW EXECUTE FUNCTION fallar_asistencia_test()',
    )
    try {
      await corregir(clase, cambio, 500)
    } finally {
      await bd.query(
        'DROP TRIGGER tg_fallar_asistencia_test ON asistencia_cambio',
      )
      await bd.query('DROP FUNCTION fallar_asistencia_test()')
    }
    expect(await leer(PROFESOR, clase, 200)).toEqual(original)
    expect(await historial(clase)).toEqual([])
  })

  it('el historial es inmutable incluso para el dueño y el SQL directo exige profesor y motivo', async () => {
    const { clase } = await preparar()
    await corregir(clase)
    const [marca] = await bd.query<{ id: string }[]>(
      'SELECT id FROM asistencia WHERE clase_id=$1 AND alumno_id=$2',
      [clase, alumnos.base],
    )
    for (const sql of [
      'UPDATE asistencia_cambio SET nuevo = anterior WHERE asistencia_id = $1',
      'DELETE FROM asistencia_cambio WHERE asistencia_id = $1',
    ]) {
      await expect(bd.query(sql, [marca.id])).rejects.toMatchObject({
        driverError: { code: SIN_PERMISO },
      })
    }
    await comoApp(
      {
        universidadId: await universidadDe('norte.cursus.test'),
        rol: 'PROFESOR',
      },
      async (q) => {
        await expect(
          q.query('UPDATE asistencia SET presente = true WHERE id = $1', [
            marca.id,
          ]),
        ).rejects.toMatchObject({ driverError: { code: SIN_PERMISO } })
      },
    )
  })

  it('RLS del historial: SELECT sin filtro oculta otra universidad e INSERT ajeno con FKs válidas se rechaza', async () => {
    const { clase } = await preparar()
    await corregir(clase)
    const norte = await universidadDe('norte.cursus.test')
    const sur = await universidadDe('sur.cursus.test')
    const profesorSur = await idDe(PROFESOR_SUR)
    const [claseSur] = await bd.query<{ id: string }[]>(
      `INSERT INTO clase (universidad_id,seccion_id,fecha,inicio,termino,sala,creada_por)
      SELECT $1,s.id,'2026-09-14','08:30','10:00','Sur',$2 FROM seccion s WHERE s.universidad_id=$1 LIMIT 1 RETURNING id`,
      [sur, profesorSur],
    )
    const [marcaSur] = await bd.query<{ id: string }[]>(
      `INSERT INTO asistencia (universidad_id,clase_id,alumno_id,presente,registrada_por)
      VALUES ($1,$2,$3,true,$4) RETURNING id`,
      [sur, claseSur.id, await idDe('alumno@sur.cursus.test'), profesorSur],
    )
    const [eventoSur] = await bd.query<{ id: string }[]>(
      `INSERT INTO asistencia_cambio (universidad_id,asistencia_id,anterior,nuevo,motivo,responsable_id) VALUES ($1,$2,true,false,'Prueba Sur',$3) RETURNING id`,
      [sur, marcaSur.id, profesorSur],
    )
    await comoApp({ universidadId: norte, rol: 'PROFESOR' }, async (q) => {
      const propias = await bd.query<{ id: string }[]>(
        'SELECT id FROM asistencia_cambio WHERE universidad_id=$1 ORDER BY id',
        [norte],
      )
      expect(propias.length).toBeGreaterThan(0)
      expect(
        await q.query('SELECT id FROM asistencia_cambio ORDER BY id'),
      ).toEqual(propias)
      await expect(
        q.query(
          `INSERT INTO asistencia_cambio (universidad_id,asistencia_id,anterior,nuevo,motivo,responsable_id) VALUES ($1,$2,true,false,'Otra universidad',$3)`,
          [sur, marcaSur.id, profesorSur],
        ),
      ).rejects.toMatchObject({ driverError: { code: SIN_PERMISO } })
    })
    expect(eventoSur.id).toBeTruthy()
  })

  it('RLS de lectura del alumno solo permite su propia marca y niega el historial', async () => {
    const { clase } = await preparar()
    await corregir(clase)
    await comoApp(
      {
        universidadId: await universidadDe('norte.cursus.test'),
        rol: 'ALUMNO',
      },
      async (q) => {
        expect(await q.query('SELECT id FROM asistencia')).toEqual([])
        await q.query(`SELECT set_config('app.asistencia_alumno_id',$1,true)`, [
          alumnos.base,
        ])
        const visibles = (await q.query(
          'SELECT alumno_id FROM asistencia',
        )) as { alumno_id: string }[]
        expect(visibles.length).toBeGreaterThan(0)
        expect(visibles.every((a) => a.alumno_id === alumnos.base)).toBe(true)
        expect(await q.query('SELECT id FROM asistencia_cambio')).toEqual([])
      },
    )
  })

  it('SQL con un profesor válido sigue exigiendo motivo y las FKs aíslan al responsable', async () => {
    const { clase } = await preparar()
    const profesor = await idDe(PROFESOR)
    const norte = await universidadDe('norte.cursus.test')
    const [marca] = await bd.query<{ id: string }[]>(
      'SELECT id FROM asistencia WHERE clase_id=$1 AND alumno_id=$2',
      [clase, alumnos.base],
    )
    await comoApp({ universidadId: norte, rol: 'PROFESOR' }, async (q) => {
      await q.query(`SELECT set_config('app.asistencia_profesor_id',$1,true)`, [
        profesor,
      ])
      await expect(
        q.query('UPDATE asistencia SET presente=false WHERE id=$1', [marca.id]),
      ).rejects.toMatchObject({ driverError: { code: '23502' } })
    })
    expect(
      (await leer(PROFESOR, clase, 200)).alumnos.find(
        (a) => a.id === alumnos.base,
      )?.presente,
    ).toBe(true)
    await expect(
      bd.query(
        `INSERT INTO asistencia_cambio (universidad_id,asistencia_id,anterior,nuevo,motivo,responsable_id) VALUES ($1,$2,true,false,'Responsable ajeno',$3)`,
        [norte, marca.id, await idDe(PROFESOR_SUR)],
      ),
    ).rejects.toMatchObject({
      driverError: {
        code: '23503',
        constraint: 'fk_asistencia_cambio_responsable',
      },
    })
  })

  it('rollback retira la auditoría y conserva la última marca corregida', async () => {
    const { clase } = await preparar()
    await corregir(clase)
    const migracion = new CrearAsistenciaCambio1792690000000()
    const q = bd.createQueryRunner()
    try {
      await migracion.down(q)
      const [marca] = await bd.query<{ presente: boolean }[]>(
        'SELECT presente FROM asistencia WHERE clase_id=$1 AND alumno_id=$2',
        [clase, alumnos.base],
      )
      expect(marca.presente).toBe(false)
    } finally {
      await migracion.up(q)
      await q.release()
    }
  })
})

describe('ASI-05: porcentaje por alumno calculado en el backend', () => {
  let numero = 10
  async function escenario(vacio = false) {
    const [s] = await bd.query<{ id: string }[]>(
      `INSERT INTO seccion (universidad_id, curso_id, numero, profesor_id)
       SELECT universidad_id, curso_id, $2, $3 FROM seccion WHERE id=$1 RETURNING id`,
      [secciones.s1, numero++, await idDe(PROFESOR)],
    )
    if (!vacio)
      for (const alumnoId of [alumnos.base, alumnos.ana, alumnos.zoe])
        await inscribir(s.id, alumnoId)
    return s.id
  }
  async function resumen(
    seccion: string,
    correo = PROFESOR,
    estado = 200,
    query = '',
  ) {
    const token = await tokenDe(correo)
    const res = await request(app.getHttpServer())
      .get(`/api/espacio/secciones/${seccion}/asistencia/resumen${query}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(estado)
    return res.body as ResumenAsistenciaSeccion
  }
  async function registrar(
    seccion: string,
    semana: number,
    ausentes: string[] = [],
  ) {
    const clase = await crearClase(seccion, semana)
    await guardar(PROFESOR, clase, marcasDe(ausentes), 201, seccion)
    return clase
  }

  it('sin clases o solo con clases pendientes devuelve null, no divide por cero ni inventa ausencias', async () => {
    const seccion = await escenario()
    expect(await resumen(seccion)).toEqual({
      clasesRegistradas: 0,
      alumnos: [
        {
          id: alumnos.base,
          nombre: 'Alumno Norte',
          asistidas: 0,
          sinMarca: 0,
          porcentaje: null,
        },
        {
          id: alumnos.ana,
          nombre: 'Ana Ávila',
          asistidas: 0,
          sinMarca: 0,
          porcentaje: null,
        },
        {
          id: alumnos.zoe,
          nombre: 'Zoe Ruiz',
          asistidas: 0,
          sinMarca: 0,
          porcentaje: null,
        },
      ],
    })
    await crearClase(seccion, 0)
    expect((await resumen(seccion)).clasesRegistradas).toBe(0)
    expect(
      (await resumen(seccion)).alumnos.every((a) => a.porcentaje === null),
    ).toBe(true)
  })

  it('cuenta cada clase una vez, calcula 0/66.67/100 y cambia al corregir y registrar otra clase', async () => {
    const seccion = await escenario()
    await registrar(seccion, 0, [alumnos.zoe])
    const segunda = await registrar(seccion, 1, [alumnos.zoe, alumnos.base])
    await registrar(seccion, 2, [alumnos.zoe])
    await crearClase(seccion, 3) // No tiene lista guardada.
    const inicial = await resumen(
      seccion,
      PROFESOR,
      200,
      `?universidadId=${await universidadDe('sur.cursus.test')}&profesorId=${await idDe(PROFESOR_SUR)}`,
    )
    expect(inicial).toEqual({
      clasesRegistradas: 3,
      alumnos: [
        {
          id: alumnos.base,
          nombre: 'Alumno Norte',
          asistidas: 2,
          sinMarca: 0,
          porcentaje: 66.67,
        },
        {
          id: alumnos.ana,
          nombre: 'Ana Ávila',
          asistidas: 3,
          sinMarca: 0,
          porcentaje: 100,
        },
        {
          id: alumnos.zoe,
          nombre: 'Zoe Ruiz',
          asistidas: 0,
          sinMarca: 0,
          porcentaje: 0,
        },
      ],
    })
    const token = await tokenDe(PROFESOR)
    await request(app.getHttpServer())
      .patch(`${ruta(seccion, segunda)}/alumnos/${alumnos.base}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ anterior: false, presente: true, motivo: 'Lista revisada' })
      .expect(200)
    const corregido = await resumen(seccion)
    expect(corregido.clasesRegistradas).toBe(3)
    expect(corregido.alumnos.find((a) => a.id === alumnos.base)).toMatchObject({
      asistidas: 3,
      porcentaje: 100,
    })
    await registrar(seccion, 4, [alumnos.base, alumnos.zoe])
    expect(
      (await resumen(seccion)).alumnos.find((a) => a.id === alumnos.base),
    ).toMatchObject({ asistidas: 3, porcentaje: 75 })
  })

  it('la lista vacía no se sustituye por alumnos de otras secciones y los datos no se mezclan', async () => {
    const vacia = await escenario(true)
    expect(await resumen(vacia)).toEqual({ clasesRegistradas: 0, alumnos: [] })
    const primera = await escenario()
    const segunda = await escenario()
    await registrar(primera, 0)
    expect((await resumen(primera)).clasesRegistradas).toBe(1)
    expect((await resumen(segunda)).clasesRegistradas).toBe(0)
  })

  it('un inscrito nuevo usa el denominador de la sección e indica las clases sin marca', async () => {
    const seccion = await escenario()
    await registrar(seccion, 0)
    const nuevo = await crearAlumno(seccion, 'Nuevo Resumen')
    await inscribir(seccion, nuevo)
    expect(
      (await resumen(seccion)).alumnos.find((a) => a.id === nuevo),
    ).toEqual({
      id: nuevo,
      nombre: 'Nuevo Resumen',
      asistidas: 0,
      sinMarca: 1,
      porcentaje: 0,
    })
    await archivarInscripcion(seccion, alumnos.ana)
    await bd.query('UPDATE usuario SET archived_at=now() WHERE id=$1', [
      alumnos.zoe,
    ])
    try {
      const lista = (await resumen(seccion)).alumnos
      expect(lista.map((a) => a.id).sort()).toEqual(
        [alumnos.base, nuevo].sort(),
      )
    } finally {
      await bd.query('UPDATE usuario SET archived_at=NULL WHERE id=$1', [
        alumnos.zoe,
      ])
    }
  })

  it('excluye clases archivadas y marcas archivadas; una clase sin marcas activas deja de contar', async () => {
    const seccion = await escenario()
    const clase = await registrar(seccion, 0)
    await bd.query(
      'UPDATE asistencia SET archived_at=now() WHERE clase_id=$1 AND alumno_id=$2',
      [clase, alumnos.base],
    )
    expect(
      (await resumen(seccion)).alumnos.find((a) => a.id === alumnos.base),
    ).toMatchObject({ asistidas: 0, sinMarca: 1, porcentaje: 0 })
    await bd.query('UPDATE clase SET archived_at=now() WHERE id=$1', [clase])
    expect((await resumen(seccion)).clasesRegistradas).toBe(0)
    await bd.query('UPDATE clase SET archived_at=NULL WHERE id=$1', [clase])
    await bd.query(
      'UPDATE asistencia SET archived_at=now() WHERE clase_id=$1',
      [clase],
    )
    expect((await resumen(seccion)).clasesRegistradas).toBe(0)
  })

  it.each([ALUMNO, AYUDANTE, DIRECTOR, ADMIN_INGENIERIA])(
    '%s no accede al resumen del profesor',
    async (correo) => {
      const seccion = await escenario()
      if (correo === AYUDANTE)
        await bd.query(
          'INSERT INTO ayudante_seccion (universidad_id,seccion_id,usuario_id) SELECT universidad_id,id,$2 FROM seccion WHERE id=$1',
          [seccion, await idDe(AYUDANTE)],
        )
      await resumen(seccion, correo, 403)
    },
  )

  it('rechaza a otro profesor, otra universidad y una sección inexistente o archivada', async () => {
    const seccion = await escenario()
    await resumen(seccion, profesorOtraSeccion, 403)
    await resumen(seccion, PROFESOR_SUR, 404)
    await resumen(NO_EXISTE, PROFESOR, 404)
    await bd.query('UPDATE seccion SET archived_at=now() WHERE id=$1', [
      seccion,
    ])
    await resumen(seccion, PROFESOR, 404)
  })
})
