import type { AsistenciaClase, ErrorListaAsistencia, Rol } from '@cursus/shared'
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
    .put(ruta(seccionId, claseId))
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

describe('PUT .../clases/:claseId/asistencia (ASI-02)', () => {
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
