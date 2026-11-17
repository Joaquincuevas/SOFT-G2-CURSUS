import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { DataSource } from 'typeorm'
import { AppModule } from '../../src/app.module.js'
import { configurarApp } from '../../src/config/configurar-app.js'
import { crearSuperadmin } from '../../src/database/crear-superadmin.js'
import { opcionesDataSource } from '../../src/database/data-source.js'
import { FIJOS } from '../../src/database/seed-demo.js'
import { ejecutarSeed, type OpcionesSeed } from '../../src/database/seed.js'

// Base propia: el seed de demo es grande y otras suites truncan sus tablas.
const BD_TEST = `${process.env.POSTGRES_TEST_DB ?? 'cursus_test'}_seed_demo`
const BD_ORIGINAL = process.env.POSTGRES_DB
const PASSWORD = 'contraseña-de-prueba'
// Fecha fija: el 16-11-2026 el período activo (2026-2) va en la semana 15.
const HOY = '2026-11-16'
const SEMBRAR = 180_000

let admin: DataSource
let bd: DataSource
let app: INestApplication<App>
let despuesDelSeed: Record<string, number>

const sembrar = (
  opciones: OpcionesSeed = {},
  env: NodeJS.ProcessEnv = { NODE_ENV: 'test' },
) =>
  ejecutarSeed(bd, PASSWORD, env, {
    facultadCompleta: true,
    demo: { hoy: HOY },
    ...opciones,
  })

const TABLAS = [
  'universidad',
  'facultad',
  'carrera',
  'periodo',
  'usuario',
  'curso',
  'seccion',
  'seccion_profesor',
  'ayudante_seccion',
  'inscripcion',
  'horario_seccion',
  'evaluacion',
  'nota',
  'nota_cambio',
  'revision_notas',
  'clase',
  'asistencia',
  'anuncio',
  'lectura_anuncio',
  'actividad',
  'cierre_curso',
  'evento_auditoria',
]
async function conteos() {
  const filas = await Promise.all(
    TABLAS.map(async (tabla) => {
      const [{ total }] = await bd.query<{ total: number }[]>(
        `SELECT count(*)::int AS total FROM ${tabla}`,
      )
      return [tabla, total] as const
    }),
  )
  return Object.fromEntries(filas)
}

async function contar(sql: string, parametros: unknown[] = []) {
  const [{ total }] = await bd.query<{ total: number }[]>(
    `SELECT count(*)::int AS total FROM (${sql}) x`,
    parametros,
  )
  return total
}

async function tokenDe(correo: string) {
  const respuesta = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ correo, password: PASSWORD })
    .expect(200)
  return (respuesta.body as { accessToken: string }).accessToken
}
async function pedir<T>(ruta: string, correo: string): Promise<T> {
  const respuesta = await request(app.getHttpServer())
    .get(ruta)
    .set('Authorization', `Bearer ${await tokenDe(correo)}`)
    .expect(200)
  return respuesta.body as T
}

beforeAll(async () => {
  admin = await new DataSource(opcionesDataSource()).initialize()
  await admin.query(`DROP DATABASE IF EXISTS "${BD_TEST}" WITH (FORCE)`)
  await admin.query(`CREATE DATABASE "${BD_TEST}"`)
  bd = await new DataSource(opcionesDataSource(BD_TEST)).initialize()
  await bd.runMigrations()
  await sembrar()
  despuesDelSeed = await conteos()
  process.env.POSTGRES_DB = BD_TEST
  const modulo = await Test.createTestingModule({
    imports: [AppModule],
  }).compile()
  app = modulo.createNestApplication<INestApplication<App>>({ logger: false })
  configurarApp(app, { secretoOrigen: '' })
  await app.listen(0, '127.0.0.1')
}, SEMBRAR)

afterAll(async () => {
  await app?.close()
  process.env.POSTGRES_DB = BD_ORIGINAL
  await bd?.destroy()
  if (admin?.isInitialized) {
    await admin.query(`DROP DATABASE IF EXISTS "${BD_TEST}" WITH (FORCE)`)
    await admin.destroy()
  }
})

describe('seed de demo', () => {
  it('carga tres períodos cerrados en Norte, uno en Sur y un solo período activo por universidad', async () => {
    const periodos = await bd.query<
      { dominio: string; activos: number; cerrados: number }[]
    >(
      `SELECT u.dominio_correo AS dominio,
              count(*) FILTER (WHERE p.activo)::int AS activos,
              count(*) FILTER (WHERE NOT p.activo)::int AS cerrados
         FROM periodo p JOIN universidad u ON u.id = p.universidad_id
        GROUP BY 1 ORDER BY 1`,
    )
    expect(periodos).toEqual([
      { dominio: 'norte.cursus.test', activos: 1, cerrados: 3 },
      { dominio: 'sur.cursus.test', activos: 1, cerrados: 1 },
    ])
  })

  it('cierra cada curso de un período anterior con todas sus notas publicadas', async () => {
    expect(
      await contar(`SELECT c.id FROM curso c JOIN periodo p ON p.id = c.periodo_id
                     WHERE NOT p.activo
                       AND NOT EXISTS (SELECT 1 FROM cierre_curso cc WHERE cc.id = c.id)`),
    ).toBe(0)
    expect(
      await contar(`SELECT c.id FROM curso c JOIN periodo p ON p.id = c.periodo_id
                     WHERE p.activo AND EXISTS (SELECT 1 FROM cierre_curso cc WHERE cc.id = c.id)`),
    ).toBe(0)
    // Cada alumno inscrito tiene una nota publicada en cada evaluación.
    expect(
      await contar(`SELECT e.id, i.usuario_id FROM evaluacion e
                      JOIN seccion s ON s.id = e.seccion_id
                      JOIN curso c ON c.id = s.curso_id
                      JOIN periodo p ON p.id = c.periodo_id AND NOT p.activo
                      JOIN inscripcion i ON i.seccion_id = s.id AND i.archived_at IS NULL
                     WHERE NOT EXISTS (SELECT 1 FROM nota n WHERE n.evaluacion_id = e.id
                                         AND n.alumno_id = i.usuario_id AND n.estado = 'PUBLICADA')`),
    ).toBe(0)
  })

  it('archiva solo los cursos del período más antiguo', async () => {
    const archivados = await bd.query<{ periodo: string; total: number }[]>(
      `SELECT p.anio || '-' || p.semestre AS periodo, count(*)::int AS total
         FROM curso c JOIN periodo p ON p.id = c.periodo_id
        WHERE c.archived_at IS NOT NULL GROUP BY 1`,
    )
    expect(archivados).toEqual([{ periodo: '2025-1', total: 15 }])
  })

  it('las ponderaciones de cada sección con evaluaciones suman 100 %', async () => {
    expect(
      await contar(`SELECT seccion_id FROM evaluacion WHERE archived_at IS NULL
                     GROUP BY seccion_id HAVING sum(ponderacion) <> 100`),
    ).toBe(0)
    // Todas las secciones vigentes de la demo tienen evaluaciones.
    expect(
      await contar(`SELECT s.id FROM seccion s
                     WHERE NOT EXISTS (SELECT 1 FROM evaluacion e WHERE e.seccion_id = s.id)`),
    ).toBe(0)
  })

  it('en el período activo solo hay notas y asistencia de fechas pasadas', async () => {
    const activo = `JOIN seccion s ON s.id = e.seccion_id JOIN curso c ON c.id = s.curso_id
                    JOIN periodo p ON p.id = c.periodo_id AND p.activo`
    expect(
      await contar(
        `SELECT n.id FROM nota n JOIN evaluacion e ON e.id = n.evaluacion_id ${activo}
          WHERE e.fecha >= $1`,
        [HOY],
      ),
    ).toBe(0)
    expect(
      await contar(
        `SELECT a.id FROM asistencia a JOIN clase e ON e.id = a.clase_id ${activo}
          WHERE e.fecha >= $1`,
        [HOY],
      ),
    ).toBe(0)
    expect(
      await contar(
        `SELECT e.id FROM actividad e ${activo} WHERE e.plazo <= $1::date`,
        [HOY],
      ),
    ).toBe(0)
  })

  it('no deja topes de horario a ningún alumno, profesor ni ayudante', async () => {
    const participantes = `
      SELECT usuario_id, seccion_id FROM inscripcion WHERE archived_at IS NULL
      UNION ALL SELECT usuario_id, seccion_id FROM seccion_profesor WHERE archived_at IS NULL
      UNION ALL SELECT usuario_id, seccion_id FROM ayudante_seccion WHERE archived_at IS NULL`
    expect(
      await contar(`
        WITH bloque AS (
          SELECT p.usuario_id, p.seccion_id, c.periodo_id, h.dia, h.inicio, h.termino
            FROM (${participantes}) p
            JOIN seccion s ON s.id = p.seccion_id JOIN curso c ON c.id = s.curso_id
            JOIN horario_seccion h ON h.seccion_id = p.seccion_id AND h.archived_at IS NULL
        )
        SELECT 1 FROM bloque a
          JOIN bloque b ON b.usuario_id = a.usuario_id AND b.periodo_id = a.periodo_id
                       AND b.dia = a.dia AND b.seccion_id > a.seccion_id
         WHERE a.inicio < b.termino AND b.inicio < a.termino`),
    ).toBe(0)
  })

  it('muestra cada estado del flujo de notas en las secciones del profesor fijo', async () => {
    const estados = await bd.query<{ codigo: string; estado: string }[]>(
      `SELECT c.codigo, r.estado FROM revision_notas r
         JOIN evaluacion e ON e.id = r.evaluacion_id
         JOIN seccion s ON s.id = e.seccion_id JOIN curso c ON c.id = s.curso_id
         JOIN periodo p ON p.id = c.periodo_id AND p.activo
        WHERE s.numero = 1 AND e.nombre = 'Prueba 2'
          AND es_profesor_de_seccion(s.id, (SELECT id FROM usuario WHERE correo = $1))
        ORDER BY c.codigo`,
      [FIJOS.profesor],
    )
    expect(estados).toEqual([
      { codigo: 'ICC202', estado: 'BORRADOR' },
      { codigo: 'ICC203', estado: 'DEVUELTA' },
      { codigo: 'ICC204', estado: 'EN_REVISION' },
    ])
  })

  it('los usuarios de la tabla del README ven sus cursos por la API', async () => {
    expect(
      await pedir<unknown[]>('/api/dashboard/secciones-alumno', FIJOS.alumno),
    ).toHaveLength(5)
    expect(
      await pedir<unknown[]>('/api/mis-cursos/historial', FIJOS.alumno),
    ).toHaveLength(3)
    expect(
      await pedir<unknown[]>('/api/dashboard/mis-secciones', FIJOS.profesor),
    ).toHaveLength(3)
    expect(
      await pedir<unknown[]>(
        '/api/dashboard/pendientes-revision',
        FIJOS.profesor,
      ),
    ).not.toHaveLength(0)
    expect(
      await pedir<unknown[]>(
        '/api/dashboard/secciones-ayudante',
        FIJOS.ayudante,
      ),
    ).toHaveLength(2)
  })

  it(
    'repetir el seed no duplica ni agrega filas',
    async () => {
      // Los inicios de sesión de los tests anteriores también cuentan.
      const antes = await conteos()
      await sembrar()
      expect(await conteos()).toEqual(antes)
    },
    SEMBRAR,
  )

  it('sin SEED_RESET=true no reinicia la base', async () => {
    const antes = await conteos()
    await expect(sembrar({ reiniciar: true })).rejects.toThrow(
      /SEED_RESET=true/,
    )
    expect(await conteos()).toEqual(antes)
  })

  it(
    'el reinicio conserva al superadmin y su MFA, y deja solo los datos del seed',
    async () => {
      const superadmin = await crearSuperadmin(bd, {
        correo: 'superadmin@cursus.test',
        nombre: 'Superadmin',
        password: 'provisoria-de-prueba',
      })
      await bd.query(
        `INSERT INTO mfa_usuario (usuario_id, secreto_cifrado) VALUES ($1, $2)`,
        [superadmin.id, `v1.${'a'.repeat(16)}.${'b'.repeat(22)}.c`],
      )
      // Un curso creado a mano durante las pruebas.
      await bd.query(
        `INSERT INTO curso (universidad_id, carrera_id, periodo_id, codigo, nombre)
         SELECT universidad_id, carrera_id, periodo_id, 'TMP999', 'Curso de prueba' FROM curso LIMIT 1`,
      )

      await sembrar(
        { reiniciar: true },
        { NODE_ENV: 'test', SEED_RESET: 'true' },
      )

      const superadmins = await bd.query<{ id: string }[]>(
        `SELECT id FROM usuario WHERE rol = 'SUPERADMIN'`,
      )
      expect(superadmins).toEqual([{ id: superadmin.id }])
      expect(await contar('SELECT 1 FROM mfa_usuario')).toBe(1)
      expect(await contar(`SELECT 1 FROM curso WHERE codigo = 'TMP999'`)).toBe(
        0,
      )
      expect(await conteos()).toEqual({
        ...despuesDelSeed,
        usuario: despuesDelSeed.usuario + 1,
      })
    },
    SEMBRAR,
  )
})
