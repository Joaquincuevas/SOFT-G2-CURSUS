import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { CursoDetalle } from '@cursus/shared'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { DataSource } from 'typeorm'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { AppModule } from '../../src/app.module.js'
import { NombreCarreraDto } from '../../src/carreras/nombre-carrera.dto.js'
import { configurarApp } from '../../src/config/configurar-app.js'
import { opcionesDataSource } from '../../src/database/data-source.js'
import { ejecutarSeed } from '../../src/database/seed.js'
import { CrearCursoDto } from '../../src/gestion/crear-curso.dto.js'
import { GuardarHorarioDto } from '../../src/gestion/guardar-horario.dto.js'
import { AgregarAlumnoDto } from '../../src/gestion/agregar-alumno.dto.js'
import { BLOQUES_HORARIO } from '../../src/gestion/horarios.sql.js'

const BD_TEST = `${process.env.POSTGRES_TEST_DB ?? 'cursus_test'}_seed_facultad`
const BD_ORIGINAL = process.env.POSTGRES_DB
const PASSWORD = 'contraseña-de-prueba'
const ADMIN = 'administrativo.ingenieria@norte.cursus.test'
const ejecutar = promisify(execFile)
const sembrar = () =>
  ejecutarSeed(bd, PASSWORD, { NODE_ENV: 'test' }, { facultadCompleta: true })
let admin: DataSource
let bd: DataSource
let app: INestApplication<App>

// Incluye IDs e historial: repetir el seed tampoco reemplaza filas por otras
// equivalentes. Se omiten los hashes que el seed base rota y los updated_at.
async function estado() {
  const tablas = [
    'universidad',
    'facultad',
    'carrera',
    'periodo',
    'usuario',
    'curso',
    'seccion',
    'horario_seccion',
    'ayudante_seccion',
    'inscripcion',
  ]
  return Object.fromEntries(
    await Promise.all(
      tablas.map(async (tabla) => {
        const filas = await bd.query<{ datos: unknown }[]>(
          `SELECT to_jsonb(t) - 'updated_at' - 'password_hash' AS datos FROM ${tabla} t ORDER BY id`,
        )
        return [tabla, filas] as const
      }),
    ),
  )
}
const ingenieria = `FROM curso c JOIN carrera ca ON ca.id = c.carrera_id
  JOIN facultad f ON f.id = ca.facultad_id JOIN universidad u ON u.id = c.universidad_id
  JOIN periodo p ON p.id = c.periodo_id
  WHERE u.dominio_correo = 'norte.cursus.test' AND f.nombre = 'Facultad de Ingeniería' AND p.activo`
async function ids() {
  const [fila] = await bd.query<
    { curso: string; seccion: string; universidad: string; periodo: string }[]
  >(`SELECT c.id AS curso, s.id AS seccion, c.universidad_id AS universidad, c.periodo_id AS periodo
     FROM seccion s JOIN curso c ON c.id = s.curso_id WHERE c.codigo = 'ICC101' AND s.numero = 1`)
  return fila
}
async function tokenDe(correo = ADMIN) {
  const respuesta = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ correo, password: PASSWORD })
    .expect(200)
  return (respuesta.body as { accessToken: string }).accessToken
}
const pedir = (ruta: string, token: string) =>
  request(app.getHttpServer()).get(ruta).set('Authorization', `Bearer ${token}`)

beforeAll(async () => {
  admin = await new DataSource(opcionesDataSource()).initialize()
  await admin.query(`DROP DATABASE IF EXISTS "${BD_TEST}" WITH (FORCE)`)
  await admin.query(`CREATE DATABASE "${BD_TEST}"`)
  bd = await new DataSource(opcionesDataSource(BD_TEST)).initialize()
  await bd.runMigrations()
  process.env.POSTGRES_DB = BD_TEST
  const modulo = await Test.createTestingModule({
    imports: [AppModule],
  }).compile()
  app = modulo.createNestApplication<INestApplication<App>>({ logger: false })
  configurarApp(app, { secretoOrigen: '' })
  await app.listen(0, '127.0.0.1')
})
beforeEach(async () => {
  await bd.query('TRUNCATE universidad CASCADE')
  await sembrar()
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

describe('GES-20: facultad completa', () => {
  it('crea tres carreras y quince cursos con dos secciones completas cada uno', async () => {
    const [cantidades] = await bd.query<
      { carreras: number; cursos: number }[]
    >(`SELECT count(DISTINCT ca.id)::int AS carreras,
      count(c.id)::int AS cursos ${ingenieria}`)
    expect(cantidades).toEqual({ carreras: 3, cursos: 15 })
    const secciones = await bd.query<
      {
        id: string
        profesor_id: string
        bloques: number
        ayudantes: number
        alumnos: number
      }[]
    >(`SELECT s.id, s.profesor_id,
      (SELECT count(*)::int FROM horario_seccion h WHERE h.seccion_id = s.id AND h.archived_at IS NULL) AS bloques,
      (SELECT count(*)::int FROM ayudante_seccion a WHERE a.seccion_id = s.id AND a.archived_at IS NULL) AS ayudantes,
      (SELECT count(*)::int FROM inscripcion i WHERE i.seccion_id = s.id AND i.archived_at IS NULL) AS alumnos
      FROM seccion s WHERE s.curso_id IN (SELECT c.id ${ingenieria})`)
    expect(secciones).toHaveLength(30)
    for (const seccion of secciones) {
      expect(seccion.profesor_id).toBeTruthy()
      expect(seccion.bloques).toBe(2)
      expect(seccion.ayudantes).toBe(2)
      expect(seccion.alumnos).toBeGreaterThanOrEqual(4)
    }
    const [{ total }] = await bd.query<{ total: number }[]>(
      'SELECT count(*)::int AS total FROM inscripcion',
    )
    expect(total).toBe(125)
  })

  it('no repite códigos ni superpone salas, profesores, ayudantes o alumnos', async () => {
    expect(
      await bd.query(
        `SELECT codigo, periodo_id FROM curso GROUP BY codigo, periodo_id HAVING count(*) > 1`,
      ),
    ).toEqual([])
    // Igualdad de sala sin distinguir mayúsculas. Comparar solo el mismo
    // período y universidad: intervalos consecutivos no son un choque.
    expect(
      await bd.query(`SELECT h.id FROM horario_seccion h JOIN seccion s ON s.id = h.seccion_id
      JOIN curso c ON c.id = s.curso_id JOIN horario_seccion h2 ON h.id < h2.id
      JOIN seccion s2 ON s2.id = h2.seccion_id JOIN curso c2 ON c2.id = s2.curso_id
      WHERE c.universidad_id = c2.universidad_id AND c.periodo_id = c2.periodo_id
        AND lower(h.sala) = lower(h2.sala) AND h.dia = h2.dia
        AND h.inicio < h2.termino AND h2.inicio < h.termino`),
    ).toEqual([])
    expect(
      await bd.query(`WITH participantes AS (
      SELECT id AS seccion, profesor_id AS usuario FROM seccion WHERE profesor_id IS NOT NULL
      UNION ALL SELECT seccion_id, usuario_id FROM ayudante_seccion
      UNION ALL SELECT seccion_id, usuario_id FROM inscripcion
    ) SELECT p.usuario FROM participantes p JOIN participantes q ON p.usuario = q.usuario AND p.seccion < q.seccion
      JOIN horario_seccion h ON h.seccion_id = p.seccion
      JOIN horario_seccion h2 ON h2.seccion_id = q.seccion
      WHERE h.dia = h2.dia AND h.inicio < h2.termino AND h2.inicio < h.termino`),
    ).toEqual([])
  })

  it('asigna exclusivamente usuarios vigentes del rol, facultad y universidad correctos', async () => {
    expect(
      await bd.query(`WITH asignaciones AS (
      SELECT id AS seccion, profesor_id AS usuario, 'PROFESOR' AS rol FROM seccion WHERE profesor_id IS NOT NULL
      UNION ALL SELECT seccion_id, usuario_id, 'AYUDANTE' FROM ayudante_seccion
      UNION ALL SELECT seccion_id, usuario_id, 'ALUMNO' FROM inscripcion
    ) SELECT a.* FROM asignaciones a JOIN usuario u ON u.id = a.usuario
      JOIN seccion s ON s.id = a.seccion JOIN curso c ON c.id = s.curso_id JOIN carrera ca ON ca.id = c.carrera_id
      JOIN universidad un ON un.id = u.universidad_id
      WHERE u.rol::text <> a.rol OR u.facultad_id <> ca.facultad_id
        OR u.universidad_id <> s.universidad_id OR u.archived_at IS NOT NULL
        OR split_part(u.correo, '@', 2) <> un.dominio_correo`),
    ).toEqual([])
  })

  it('los datos persistidos cumplen los DTO de gestión', async () => {
    const carreras = await bd.query<{ nombre: string }[]>(
      'SELECT nombre FROM carrera',
    )
    const cursos = await bd.query<
      Record<string, unknown>[]
    >(`SELECT codigo, nombre,
      carrera_id AS "carreraId", periodo_id AS "periodoId" FROM curso`)
    const horarios = await bd.query<
      Record<string, unknown>[]
    >(`SELECT s.horario_version AS version,
      ${BLOQUES_HORARIO} AS bloques FROM seccion s WHERE s.profesor_id IS NOT NULL`)
    const alumnos = await bd.query<Record<string, unknown>[]>(
      `SELECT nombre, correo FROM usuario WHERE rol = 'ALUMNO'`,
    )
    const datos = [
      ...carreras.map((c) => plainToInstance(NombreCarreraDto, c)),
      ...cursos.map((c) => plainToInstance(CrearCursoDto, c)),
      ...horarios.map((h) => plainToInstance(GuardarHorarioDto, h)),
      ...alumnos.map((a) => plainToInstance(AgregarAlumnoDto, a)),
    ]
    for (const dato of datos) {
      expect(
        await validate(dato, { whitelist: true, forbidNonWhitelisted: true }),
      ).toEqual([])
    }
  })

  it('muestra la demo por la API con el aislamiento entre facultades y universidades', async () => {
    const token = await tokenDe()
    const carreras = await pedir('/api/carreras', token).expect(200)
    expect(carreras.body).toHaveLength(3)
    const cursos = await pedir('/api/cursos', token).expect(200)
    expect(cursos.body).toHaveLength(15)
    for (const { id } of cursos.body as { id: string }[]) {
      const detalle = (await pedir(`/api/cursos/${id}`, token).expect(200))
        .body as CursoDetalle
      expect(detalle.secciones).toHaveLength(2)
      for (const seccion of detalle.secciones) {
        expect(seccion.horario).toMatch(/ING-10[12]/)
        expect(seccion.profesor).toBeTruthy()
        expect(seccion.ayudantes).toHaveLength(2)
        expect(seccion.alumnos).toBeGreaterThan(0)
      }
    }
    const { curso, seccion } = await ids()
    for (const correo of [
      'administrativo.economia@norte.cursus.test',
      'administrativo@sur.cursus.test',
    ]) {
      const ajeno = await tokenDe(correo)
      expect((await pedir('/api/cursos', ajeno).expect(200)).body).toHaveLength(
        2,
      )
      await pedir(`/api/cursos/${curso}`, ajeno).expect(404)
      await pedir(`/api/secciones/${seccion}/alumnos`, ajeno).expect(404)
    }
    const director = await tokenDe('director@sur.cursus.test')
    const detalle = await pedir(`/api/cursos/${curso}`, director).expect(200)
    expect((detalle.body as CursoDetalle).secciones[0].horario).toContain(
      'ING-101',
    )
  })

  it('el comando real carga la facultad y no duplica filas al repetirse', async () => {
    await bd.query('TRUNCATE universidad CASCADE')
    const comando = () =>
      ejecutar(
        process.execPath,
        ['--import', 'tsx', 'src/database/ejecutar-seed.ts'],
        {
          env: {
            ...process.env,
            NODE_ENV: 'test',
            POSTGRES_DB: BD_TEST,
            SEED_PASSWORD: PASSWORD,
          },
        },
      )
    const primera = await comando()
    expect(primera.stdout).toContain('3 carreras, 15 cursos y 30 secciones')
    expect(primera.stderr).toBe('')
    const antes = await estado()
    await comando()
    expect(await estado()).toEqual(antes)
  })

  it('conserva las ediciones, los horarios quitados y las asignaciones archivadas', async () => {
    const { curso, seccion } = await ids()
    await bd.query(
      `UPDATE curso SET nombre = 'Nombre editado por el cliente' WHERE id = $1`,
      [curso],
    )
    await bd.query(
      'UPDATE seccion SET profesor_id = NULL, horario_version = 2 WHERE id = $1',
      [seccion],
    )
    await bd.query(
      'UPDATE horario_seccion SET archived_at = now() WHERE seccion_id = $1',
      [seccion],
    )
    await bd.query(
      'UPDATE ayudante_seccion SET archived_at = now() WHERE seccion_id = $1',
      [seccion],
    )
    await bd.query(
      `UPDATE inscripcion SET archived_at = now(), archivada_por =
      (SELECT id FROM usuario WHERE correo = $2) WHERE seccion_id = $1`,
      [seccion, ADMIN],
    )
    // Un curso y una sección archivados tampoco vuelven a activarse.
    await bd.query(
      `UPDATE curso SET archived_at = now() WHERE codigo = 'ICI201'`,
    )
    await bd.query(
      `UPDATE seccion SET archived_at = now() WHERE curso_id = $1 AND numero = 2`,
      [curso],
    )
    const antes = await estado()
    await sembrar()
    expect(await estado()).toEqual(antes)
  })

  it('usa el período que está activo sin alterar los datos de períodos anteriores', async () => {
    const { universidad, periodo } = await ids()
    const anteriores = await bd.query<
      { id: string; profesor_id: string | null; horario_version: number }[]
    >('SELECT id, profesor_id, horario_version FROM seccion ORDER BY id')
    await bd.query('UPDATE periodo SET activo = false WHERE id = $1', [periodo])
    await bd.query(
      `INSERT INTO periodo (universidad_id, anio, semestre, fecha_inicio, fecha_termino, activo)
      VALUES ($1, 2027, 1, '2027-03-01', '2027-07-15', true)`,
      [universidad],
    )
    expect(await sembrar()).toEqual({ carreras: 3, cursos: 15, secciones: 30 })
    const [actual] = await bd.query<{ cursos: number }[]>(
      `SELECT count(*)::int AS cursos ${ingenieria} AND p.anio = 2027`,
    )
    expect(actual.cursos).toBe(15)
    expect(
      await bd.query(
        'SELECT id, profesor_id, horario_version FROM seccion WHERE id = ANY($1::uuid[]) ORDER BY id',
        [anteriores.map((s) => s.id)],
      ),
    ).toEqual(anteriores)
  })

  it('rechaza una sala ya ocupada y revierte toda la ejecución', async () => {
    await bd.query('TRUNCATE universidad CASCADE')
    await ejecutarSeed(bd, PASSWORD)
    await bd.query(`INSERT INTO horario_seccion (universidad_id, seccion_id, dia, inicio, termino, sala)
      SELECT s.universidad_id, s.id, 1, '08:45', '09:15', 'ing-101'
      FROM seccion s JOIN curso c ON c.id = s.curso_id WHERE c.codigo = 'ICO101' AND s.numero = 1`)
    const antes = await estado()
    await expect(sembrar()).rejects.toThrow(/sala ING-101 ya está ocupada/)
    expect(await estado()).toEqual(antes)
  })

  it('rechaza un código demo ocupado por otra carrera sin modificarla', async () => {
    await bd.query('TRUNCATE universidad CASCADE')
    await ejecutarSeed(bd, PASSWORD)
    await bd.query(`INSERT INTO curso (universidad_id, carrera_id, periodo_id, codigo, nombre)
      SELECT universidad_id, carrera_id, periodo_id, 'ICC202', 'Curso del cliente' FROM curso WHERE codigo = 'ICO101'`)
    const antes = await estado()
    await expect(sembrar()).rejects.toThrow(
      /código demo ICC202 ya pertenece a otra carrera/,
    )
    expect(await estado()).toEqual(antes)
  })

  it('una falla al inscribir alumnos revierte carreras, cursos y asignaciones', async () => {
    await bd.query('TRUNCATE universidad CASCADE')
    await ejecutarSeed(bd, PASSWORD)
    const antes = await estado()
    await bd.query(`CREATE FUNCTION rechazar_seed() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'fallo simulado de inscripción'; END; $$`)
    await bd.query(
      'CREATE TRIGGER rechazar_seed BEFORE INSERT ON inscripcion FOR EACH ROW EXECUTE FUNCTION rechazar_seed()',
    )
    try {
      await expect(sembrar()).rejects.toThrow(/fallo simulado/)
      expect(await estado()).toEqual(antes)
    } finally {
      await bd.query('DROP TRIGGER rechazar_seed ON inscripcion')
      await bd.query('DROP FUNCTION rechazar_seed()')
    }
  })

  it('dos ejecuciones simultáneas conservan una sola copia de la demo', async () => {
    await bd.query('TRUNCATE universidad CASCADE')
    expect(await Promise.all([sembrar(), sembrar()])).toEqual([
      { carreras: 3, cursos: 15, secciones: 30 },
      { carreras: 3, cursos: 15, secciones: 30 },
    ])
    const antes = await estado()
    await sembrar()
    expect(await estado()).toEqual(antes)
  })
})
