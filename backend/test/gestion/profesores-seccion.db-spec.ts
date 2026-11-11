import type {
  NotasEvaluacion,
  ProfesorAsignable,
  ProfesorQuitado,
  ProfesorResumen,
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
import { ROL_APP } from '../../src/database/base-de-datos.service.js'
import { opcionesDataSource } from '../../src/database/data-source.js'
import { ejecutarSeed } from '../../src/database/seed.js'

// GES-25: base propia con el seed cargado, que se crea y se borra en cada
// ejecución. Todos los usuarios del seed comparten la contraseña.
const BD_TEST = `${process.env.POSTGRES_TEST_DB ?? 'cursus_test'}_profesores_seccion`
const PASSWORD = 'contraseña-de-prueba'
const BD_ORIGINAL = process.env.POSTGRES_DB
const SIN_PERMISO = '42501'

const PROFESOR = 'profesor@norte.cursus.test'
const AYUDANTE = 'ayudante@norte.cursus.test'
const ADMIN = 'administrativo.ingenieria@norte.cursus.test'
const ALUMNO = 'alumno@norte.cursus.test'
const PROFESOR_SUR = 'profesor@sur.cursus.test'

let admin: DataSource
let bd: DataSource
let app: INestApplication<App>
const tokens = new Map<string, string>()
const ids = { norte: '', sur: '', s1: '', s2: '' }
// Segundo y tercer profesor de Norte (cuentas de demo del seed).
let profesor2 = ''
let profesor3 = ''
// Un Administrativo de Sur.
let adminSur = ''

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
async function pedir(
  metodo: 'get' | 'post' | 'put' | 'patch',
  correo: string,
  ruta: string,
  estado: number,
  cuerpo?: object,
) {
  const token = await tokenDe(correo)
  const peticion = request(app.getHttpServer())
    [metodo](ruta)
    .set('Authorization', `Bearer ${token}`)
  const respuesta = await (cuerpo ? peticion.send(cuerpo) : peticion).expect(
    estado,
  )
  return respuesta.body as unknown
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
        JOIN universidad u ON u.id = s.universidad_id
       WHERE c.codigo = $1 AND s.numero = $2
         AND u.dominio_correo = 'norte.cursus.test'`,
      [codigo, numero],
    )
  )[0].id

// GES-25: asigna un profesor como lo hace la API nueva, en seccion_profesor
// (como dueño de la tabla, sin RLS).
const asignarProfesor = async (seccionId: string, correo: string) =>
  bd.query<unknown>(
    `INSERT INTO seccion_profesor (universidad_id, seccion_id, usuario_id)
     SELECT universidad_id, $1, $2 FROM seccion WHERE id = $1`,
    [seccionId, await idDe(correo)],
  )

const vigentes = (seccionId: string) =>
  bd.query<{ correo: string }[]>(
    `SELECT u.correo FROM seccion_profesor sp JOIN usuario u ON u.id = sp.usuario_id
      WHERE sp.seccion_id = $1 AND sp.archived_at IS NULL
      ORDER BY sp.created_at, sp.id`,
    [seccionId],
  )

const profesorIdDe = async (seccionId: string) =>
  (
    await bd.query<{ correo: string | null }[]>(
      `SELECT u.correo FROM seccion s LEFT JOIN usuario u ON u.id = s.profesor_id
        WHERE s.id = $1`,
      [seccionId],
    )
  )[0].correo

const filasDe = async (seccionId: string) =>
  Number(
    (
      await bd.query<{ n: string }[]>(
        'SELECT count(*) AS n FROM seccion_profesor WHERE seccion_id = $1',
        [seccionId],
      )
    )[0].n,
  )

// Deja la sección solo con los profesores dados, en ese orden (como dueño).
async function dejarProfesores(seccionId: string, correos: string[]) {
  await bd.query(
    `UPDATE seccion_profesor SET archived_at = now()
      WHERE seccion_id = $1 AND archived_at IS NULL`,
    [seccionId],
  )
  for (const correo of correos) await asignarProfesor(seccionId, correo)
}

// Consulta con el rol de la API, en una transacción que se revierte.
async function comoApp(
  sesion: { universidadId: string; rol: Rol; usuarioId?: string },
  prueba: (q: QueryRunner) => Promise<void>,
) {
  const q = bd.createQueryRunner()
  await q.startTransaction()
  try {
    await q.query(`SET LOCAL ROLE ${ROL_APP}`)
    await q.query(
      `SELECT set_config('app.universidad_id', $1, true),
              set_config('app.rol', $2, true),
              set_config('app.usuario_id', $3, true)`,
      [sesion.universidadId, sesion.rol, sesion.usuarioId ?? ''],
    )
    await prueba(q)
  } finally {
    await q.rollbackTransaction()
    await q.release()
  }
}

beforeAll(async () => {
  admin = await new DataSource(opcionesDataSource()).initialize()
  await admin.query(`DROP DATABASE IF EXISTS "${BD_TEST}" WITH (FORCE)`)
  await admin.query(`CREATE DATABASE "${BD_TEST}"`)
  bd = await new DataSource(opcionesDataSource(BD_TEST)).initialize()
  await bd.runMigrations()
  await ejecutarSeed(bd, PASSWORD)

  const [{ norte }] = await bd.query<{ norte: string }[]>(
    `SELECT id AS norte FROM universidad WHERE dominio_correo = 'norte.cursus.test'`,
  )
  const [{ sur }] = await bd.query<{ sur: string }[]>(
    `SELECT id AS sur FROM universidad WHERE dominio_correo = 'sur.cursus.test'`,
  )
  ids.norte = norte
  ids.sur = sur
  ids.s1 = await seccionDe('ICC101', 1)
  ids.s2 = await seccionDe('ICC101', 2)
  const demo = await bd.query<{ correo: string }[]>(
    `SELECT correo FROM usuario
      WHERE universidad_id = $1 AND rol = 'PROFESOR' AND correo <> $2
        AND archived_at IS NULL
      ORDER BY correo LIMIT 2`,
    [ids.norte, PROFESOR],
  )
  profesor2 = demo[0].correo
  profesor3 = demo[1].correo
  await dejarProfesores(ids.s1, [PROFESOR])
  ;[{ correo: adminSur }] = await bd.query<{ correo: string }[]>(
    `SELECT correo FROM usuario
      WHERE universidad_id = $1 AND rol = 'ADMINISTRATIVO' AND archived_at IS NULL
      ORDER BY correo LIMIT 1`,
    [ids.sur],
  )
  // Un alumno inscrito en s1, para las notas y la asistencia.
  await bd.query(
    `INSERT INTO inscripcion (universidad_id, seccion_id, usuario_id)
     SELECT universidad_id, $1, $2 FROM seccion WHERE id = $1
       AND NOT EXISTS (SELECT 1 FROM inscripcion
                        WHERE seccion_id = $1 AND usuario_id = $2
                          AND archived_at IS NULL)`,
    [ids.s1, await idDe(ALUMNO)],
  )
  await bd.query(
    `INSERT INTO ayudante_seccion (universidad_id, seccion_id, usuario_id)
     SELECT universidad_id, $1, $2 FROM seccion WHERE id = $1
     ON CONFLICT DO NOTHING`,
    [ids.s1, await idDe(AYUDANTE)],
  )

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

describe('migración y sincronización con seccion.profesor_id (GES-25)', () => {
  it('el backfill conserva al profesor de cada sección', async () => {
    // Revierte GES-25, asigna con el modelo anterior y vuelve a migrar.
    await bd.undoLastMigration()
    try {
      await bd.query('UPDATE seccion SET profesor_id = $2 WHERE id = $1', [
        ids.s2,
        await idDe(profesor3),
      ])
    } finally {
      await bd.runMigrations()
    }
    expect((await vigentes(ids.s2)).map((v) => v.correo)).toEqual([profesor3])
    expect(await profesorIdDe(ids.s2)).toBe(profesor3)
    await dejarProfesores(ids.s1, [PROFESOR])
  })

  it('agregar un segundo profesor no cambia profesor_id', async () => {
    await dejarProfesores(ids.s2, [profesor2])
    await asignarProfesor(ids.s2, profesor3)
    expect(await profesorIdDe(ids.s2)).toBe(profesor2)
  })

  it('quitar al primero deja profesor_id en el siguiente vigente, y quitar al último lo deja NULL', async () => {
    await dejarProfesores(ids.s2, [profesor2, profesor3])
    const archivar = async (correo: string) =>
      bd.query<unknown>(
        `UPDATE seccion_profesor SET archived_at = now()
          WHERE seccion_id = $1 AND usuario_id = $2 AND archived_at IS NULL`,
        [ids.s2, await idDe(correo)],
      )
    await archivar(profesor2)
    expect(await profesorIdDe(ids.s2)).toBe(profesor3)
    await archivar(profesor3)
    expect(await profesorIdDe(ids.s2)).toBeNull()
  })

  it('el código anterior (UPDATE profesor_id) agrega al nuevo y archiva solo al anterior, sin tocar al co-profesor', async () => {
    await dejarProfesores(ids.s2, [profesor2, profesor3])
    const antes = await filasDe(ids.s2)

    await bd.query('UPDATE seccion SET profesor_id = $2 WHERE id = $1', [
      ids.s2,
      await idDe(PROFESOR),
    ])

    // Sin recursión: exactamente una fila nueva (la del nuevo).
    expect(await filasDe(ids.s2)).toBe(antes + 1)
    expect((await vigentes(ids.s2)).map((v) => v.correo)).toEqual([
      profesor3,
      PROFESOR,
    ])
    // profesor_id es el primer vigente.
    expect(await profesorIdDe(ids.s2)).toBe(profesor3)
  })

  it('el código anterior que reemplaza al primero por un profesor ya asignado archiva solo al primero y conserva la asignación del otro', async () => {
    // Asignados en este orden: PROFESOR, profesor2 y profesor3.
    await dejarProfesores(ids.s2, [PROFESOR, profesor2, profesor3])
    const asignacionDe = async (correo: string) =>
      (
        await bd.query<{ id: string; created_at: Date }[]>(
          `SELECT id, created_at FROM seccion_profesor
            WHERE seccion_id = $1 AND usuario_id = $2 AND archived_at IS NULL`,
          [ids.s2, await idDe(correo)],
        )
      )[0]
    const archivadasDe = () =>
      bd.query<{ id: string; correo: string }[]>(
        `SELECT sp.id, u.correo FROM seccion_profesor sp
           JOIN usuario u ON u.id = sp.usuario_id
          WHERE sp.seccion_id = $1 AND sp.archived_at IS NOT NULL`,
        [ids.s2],
      )
    const antes = await asignacionDe(profesor3)
    const filas = await filasDe(ids.s2)
    const archivadasAntes = new Set((await archivadasDe()).map((a) => a.id))

    // El PUT anterior: reemplaza al primero (PROFESOR) por profesor3.
    await bd.query('UPDATE seccion SET profesor_id = $2 WHERE id = $1', [
      ids.s2,
      await idDe(profesor3),
    ])

    expect((await vigentes(ids.s2)).map((v) => v.correo)).toEqual([
      profesor2,
      profesor3,
    ])
    // Sin filas nuevas, la asignación de profesor3 intacta, y solo se
    // archivó la del primero.
    expect(await filasDe(ids.s2)).toBe(filas)
    expect(await asignacionDe(profesor3)).toEqual(antes)
    expect(
      (await archivadasDe())
        .filter((a) => !archivadasAntes.has(a.id))
        .map((a) => a.correo),
    ).toEqual([PROFESOR])
    expect(await profesorIdDe(ids.s2)).toBe(profesor2)
  })

  it('el código anterior sin co-profesores reemplaza al profesor y deja profesor_id en el nuevo', async () => {
    await dejarProfesores(ids.s2, [profesor2])
    const antes = await filasDe(ids.s2)

    await bd.query('UPDATE seccion SET profesor_id = $2 WHERE id = $1', [
      ids.s2,
      await idDe(profesor3),
    ])

    expect(await filasDe(ids.s2)).toBe(antes + 1)
    expect((await vigentes(ids.s2)).map((v) => v.correo)).toEqual([profesor3])
    expect(await profesorIdDe(ids.s2)).toBe(profesor3)
  })

  it('el código anterior que deja profesor_id en NULL archiva solo al anterior', async () => {
    await dejarProfesores(ids.s2, [profesor2, profesor3])
    await bd.query('UPDATE seccion SET profesor_id = NULL WHERE id = $1', [
      ids.s2,
    ])
    expect((await vigentes(ids.s2)).map((v) => v.correo)).toEqual([profesor3])
    // La sincronización vuelve a dejar profesor_id en el vigente.
    expect(await profesorIdDe(ids.s2)).toBe(profesor3)
  })
})

describe('gestión de profesores de una sección (GES-25)', () => {
  const ruta = (seccionId = ids.s2) => `/api/secciones/${seccionId}/profesores`

  it('agrega varios profesores y los lista; un duplicado responde 409', async () => {
    await dejarProfesores(ids.s2, [])
    expect(
      await pedir('post', ADMIN, ruta(), 200, {
        profesorId: await idDe(profesor2),
      }),
    ).toEqual([expect.objectContaining({ id: await idDe(profesor2) })])
    const asignados = (await pedir('post', ADMIN, ruta(), 200, {
      profesorId: await idDe(profesor3),
    })) as ProfesorResumen[]
    expect(asignados.map((p) => p.id).sort()).toEqual(
      [await idDe(profesor2), await idDe(profesor3)].sort(),
    )

    const duplicado = (await pedir('post', ADMIN, ruta(), 409, {
      profesorId: await idDe(profesor2),
    })) as { message: string }
    expect(duplicado.message).toMatch(/ya es profesor de esta sección/)
    expect(await vigentes(ids.s2)).toHaveLength(2)

    const opciones = (await pedir(
      'get',
      ADMIN,
      ruta(),
      200,
    )) as ProfesorAsignable[]
    expect(
      opciones
        .filter((o) => o.asignado)
        .map((o) => o.id)
        .sort(),
    ).toEqual([await idDe(profesor2), await idDe(profesor3)].sort())
  })

  it('agregar un profesor inexistente, de otra universidad o con otro rol responde 404', async () => {
    for (const correo of [PROFESOR_SUR, AYUDANTE]) {
      await pedir('post', ADMIN, ruta(), 404, {
        profesorId: await idDe(correo),
      })
    }
  })

  it('quitar exige motivo (400), registra el cambio y deja a los demás', async () => {
    await dejarProfesores(ids.s2, [profesor2, profesor3])
    const quitar = `${ruta()}/${await idDe(profesor2)}/quitar`
    await pedir('patch', ADMIN, quitar, 400, {})
    await pedir('patch', ADMIN, quitar, 400, { motivo: '   ' })

    const quitado = (await pedir('patch', ADMIN, quitar, 200, {
      motivo: 'Se asignó por error',
    })) as ProfesorQuitado
    expect(quitado.quitado.id).toBe(await idDe(profesor2))
    expect(quitado.motivo).toBe('Se asignó por error')
    expect(quitado.profesores.map((p) => p.id)).toEqual([await idDe(profesor3)])
    const [cambio] = await bd.query<
      { tipo: string; anterior_id: string; motivo: string }[]
    >(
      `SELECT tipo, anterior_id, motivo FROM asignacion_cambio
        WHERE seccion_id = $1 ORDER BY fecha DESC, id DESC LIMIT 1`,
      [ids.s2],
    )
    expect(cambio).toEqual({
      tipo: 'PROFESOR',
      anterior_id: await idDe(profesor2),
      motivo: 'Se asignó por error',
    })
    // Ya no está: 404.
    await pedir('patch', ADMIN, quitar, 404, { motivo: 'Otra vez' })
  })

  it('el endpoint anterior de quitar sigue funcionando con varios profesores', async () => {
    await dejarProfesores(ids.s2, [profesor2, profesor3])
    const anterior = `/api/secciones/${ids.s2}/profesor/quitar`
    await pedir('patch', ADMIN, anterior, 200, {
      motivo: 'Cambio de carga',
      profesorId: await idDe(profesor3),
    })
    expect((await vigentes(ids.s2)).map((v) => v.correo)).toEqual([profesor2])
    // Si ese profesor ya no está, 409 con el primero vigente.
    const cambiado = (await pedir('patch', ADMIN, anterior, 409, {
      motivo: 'Cambio de carga',
      profesorId: await idDe(profesor3),
    })) as { profesor: { id: string } | null }
    expect(cambiado.profesor?.id).toBe(await idDe(profesor2))
  })

  it('el ayudante y el profesor no gestionan profesores (403)', async () => {
    for (const correo of [AYUDANTE, PROFESOR]) {
      await pedir('post', correo, ruta(), 403, {
        profesorId: await idDe(profesor2),
      })
    }
  })
})

describe('dos profesores tienen los mismos permisos (GES-25)', () => {
  const espacio = (resto: string) => `/api/espacio/secciones/${ids.s1}/${resto}`

  beforeAll(async () => {
    await dejarProfesores(ids.s1, [PROFESOR, profesor2])
  })

  it('el segundo profesor entra a la sección con el rol PROFESOR y ve a los dos', async () => {
    const resumen = (await pedir(
      'get',
      profesor2,
      espacio('resumen'),
      200,
    )) as { rol: string; profesores: string[] }
    expect(resumen.rol).toBe('PROFESOR')
    expect(resumen.profesores).toHaveLength(2)
  })

  it('publica anuncios en la sección', async () => {
    await pedir('post', profesor2, espacio('anuncios'), 201, {
      titulo: 'Del segundo profesor',
      cuerpo: 'Hola',
      seccionId: ids.s1,
    })
  })

  it('crea actividades de entrega', async () => {
    const [{ termino }] = await bd.query<{ termino: string }[]>(
      `SELECT to_char(p.fecha_termino, 'YYYY-MM-DD') AS termino
         FROM seccion s JOIN curso c ON c.id = s.curso_id
         JOIN periodo p ON p.id = c.periodo_id WHERE s.id = $1`,
      [ids.s1],
    )
    await pedir('post', profesor2, espacio('actividades'), 201, {
      titulo: 'Tarea del segundo profesor',
      instrucciones: 'Entregar en PDF',
      fecha: termino,
      hora: '23:00',
    })
  })

  it('corrige la asistencia (trigger auditar_correccion_asistencia)', async () => {
    const [alumno] = await bd.query<{ id: string }[]>(
      `SELECT usuario_id AS id FROM inscripcion
        WHERE seccion_id = $1 AND archived_at IS NULL LIMIT 1`,
      [ids.s1],
    )
    const [{ clase }] = await bd.query<{ clase: string }[]>(
      `INSERT INTO clase (universidad_id, seccion_id, fecha, inicio, termino, sala, creada_por)
       SELECT universidad_id, id, current_date, '08:30', '10:00', 'Sala', $2
         FROM seccion WHERE id = $1 RETURNING id AS clase`,
      [ids.s1, await idDe(PROFESOR)],
    )
    await bd.query(
      `INSERT INTO asistencia (universidad_id, clase_id, alumno_id, presente, registrada_por)
       SELECT universidad_id, $1, $2, false, $3 FROM clase WHERE id = $1`,
      [clase, alumno.id, await idDe(PROFESOR)],
    )
    await pedir(
      'patch',
      profesor2,
      espacio(`clases/${clase}/asistencia/alumnos/${alumno.id}`),
      200,
      { anterior: false, presente: true, motivo: 'Llegó tarde' },
    )
    const [cambio] = await bd.query<{ responsable_id: string }[]>(
      `SELECT ac.responsable_id FROM asistencia_cambio ac
         JOIN asistencia a ON a.id = ac.asistencia_id
        WHERE a.clase_id = $1`,
      [clase],
    )
    expect(cambio.responsable_id).toBe(await idDe(profesor2))
  })

  // Las tres políticas reescritas (NOT-11 y NOT-12), con dos profesores.
  async function evaluacionEnRevision() {
    const [{ id: evaluacion }] = await bd.query<{ id: string }[]>(
      `INSERT INTO evaluacion (universidad_id, seccion_id, nombre, fecha, ponderacion, creada_por)
       SELECT s.universidad_id, s.id, 'Control ' || gen_random_uuid(), p.fecha_inicio, 10, $2
         FROM seccion s JOIN curso c ON c.id = s.curso_id
         JOIN periodo p ON p.id = c.periodo_id WHERE s.id = $1
       RETURNING id`,
      [ids.s1, await idDe(PROFESOR)],
    )
    const inscritos = await bd.query<{ id: string }[]>(
      `SELECT usuario_id AS id FROM inscripcion
        WHERE seccion_id = $1 AND archived_at IS NULL`,
      [ids.s1],
    )
    await pedir(
      'put',
      AYUDANTE,
      espacio(`evaluaciones/${evaluacion}/notas`),
      200,
      {
        notas: inscritos.map((a) => ({ alumnoId: a.id, nota: 5 })),
      },
    )
    await pedir(
      'post',
      AYUDANTE,
      espacio(`evaluaciones/${evaluacion}/notas/envio`),
      200,
    )
    return evaluacion
  }

  it('aprueba y publica (pol_nota_publicacion y pol_revision_notas_aprobacion)', async () => {
    const evaluacion = await evaluacionEnRevision()
    const aprobada = (await pedir(
      'post',
      profesor2,
      espacio(`evaluaciones/${evaluacion}/notas/aprobacion`),
      200,
    )) as NotasEvaluacion
    expect(aprobada.estado).toBe('APROBADA')
    expect(aprobada.alumnos.every((a) => a.estado === 'PUBLICADA')).toBe(true)
  })

  it('devuelve al ayudante (pol_revision_notas_devolucion)', async () => {
    const evaluacion = await evaluacionEnRevision()
    const devuelta = (await pedir(
      'post',
      profesor2,
      espacio(`evaluaciones/${evaluacion}/notas/devolucion`),
      200,
      { comentario: 'Revisa la 2' },
    )) as NotasEvaluacion
    expect(devuelta.estado).toBe('DEVUELTA')
  })

  it('como cursus_app, los dos profesores alcanzan las filas de las tres políticas', async () => {
    for (const correo of [PROFESOR, profesor2]) {
      const evaluacion = await evaluacionEnRevision()
      const usuarioId = await idDe(correo)
      await comoApp(
        { universidadId: ids.norte, rol: 'PROFESOR', usuarioId },
        async (q) => {
          const [, notas] = await q.query<[unknown[], number]>(
            `UPDATE nota SET estado = 'PUBLICADA' WHERE evaluacion_id = $1 RETURNING id`,
            [evaluacion],
          )
          expect(Number(notas)).toBeGreaterThan(0)
          const [, aprobada] = await q.query<[unknown[], number]>(
            `UPDATE revision_notas SET estado = 'APROBADA', actualizado_por = $2
              WHERE evaluacion_id = $1 RETURNING id`,
            [evaluacion, usuarioId],
          )
          expect(Number(aprobada)).toBe(1)
        },
      )
      await comoApp(
        { universidadId: ids.norte, rol: 'PROFESOR', usuarioId },
        async (q) => {
          const [, devuelta] = await q.query<[unknown[], number]>(
            `UPDATE revision_notas
                SET estado = 'DEVUELTA', actualizado_por = $2,
                    comentario_devolucion = 'Revisa'
              WHERE evaluacion_id = $1 RETURNING id`,
            [evaluacion, usuarioId],
          )
          expect(Number(devuelta)).toBe(1)
        },
      )
    }
  })
})

describe('un profesor quitado pierde el acceso (GES-25)', () => {
  const espacio = (resto: string) => `/api/espacio/secciones/${ids.s1}/${resto}`

  it('tras quitarlo, no entra a la sección, no aprueba y la RLS no le alcanza filas', async () => {
    await dejarProfesores(ids.s1, [PROFESOR, profesor2])
    // Una evaluación en revisión, antes de quitarlo.
    const [{ id: evaluacion }] = await bd.query<{ id: string }[]>(
      `INSERT INTO evaluacion (universidad_id, seccion_id, nombre, fecha, ponderacion, creada_por)
       SELECT s.universidad_id, s.id, 'Control quitado', p.fecha_inicio, 10, $2
         FROM seccion s JOIN curso c ON c.id = s.curso_id
         JOIN periodo p ON p.id = c.periodo_id WHERE s.id = $1
       RETURNING id`,
      [ids.s1, await idDe(PROFESOR)],
    )
    await bd.query(
      `INSERT INTO revision_notas (universidad_id, evaluacion_id, estado, actualizado_por)
       SELECT universidad_id, id, 'EN_REVISION', $2 FROM evaluacion WHERE id = $1`,
      [evaluacion, await idDe(AYUDANTE)],
    )

    await pedir(
      'patch',
      ADMIN,
      `/api/secciones/${ids.s1}/profesores/${await idDe(profesor2)}/quitar`,
      200,
      { motivo: 'Termina su reemplazo' },
    )

    await pedir('get', profesor2, espacio('resumen'), 403)
    await pedir(
      'post',
      profesor2,
      espacio(`evaluaciones/${evaluacion}/notas/aprobacion`),
      403,
    )
    await comoApp(
      {
        universidadId: ids.norte,
        rol: 'PROFESOR',
        usuarioId: await idDe(profesor2),
      },
      async (q) => {
        const [, filas] = await q.query<[unknown[], number]>(
          `UPDATE revision_notas SET estado = 'APROBADA', actualizado_por = usuario_actual()
            WHERE evaluacion_id = $1 RETURNING id`,
          [evaluacion],
        )
        expect(Number(filas)).toBe(0)
      },
    )
    // El que sigue asignado mantiene el acceso.
    await pedir('get', PROFESOR, espacio('resumen'), 200)
  })
})

describe('RLS de seccion_profesor (GES-25)', () => {
  it('otra universidad no ve ni escribe las asignaciones de Norte', async () => {
    const sur = { universidadId: ids.sur, rol: 'ADMINISTRATIVO' as const }
    await comoApp(sur, async (q) => {
      expect(
        await q.query<unknown[]>(
          'SELECT 1 FROM seccion_profesor WHERE seccion_id = $1',
          [ids.s1],
        ),
      ).toEqual([])
    })
    await comoApp(sur, async (q) => {
      await expect(
        q.query(
          `INSERT INTO seccion_profesor (universidad_id, seccion_id, usuario_id)
           VALUES ($1, $2, $3)`,
          [ids.norte, ids.s1, await idDe(profesor3)],
        ),
      ).rejects.toMatchObject({ driverError: { code: SIN_PERMISO } })
    })
    await comoApp(sur, async (q) => {
      const [, archivadas] = await q.query<[unknown[], number]>(
        `UPDATE seccion_profesor SET archived_at = now()
          WHERE seccion_id = $1 RETURNING id`,
        [ids.s1],
      )
      expect(Number(archivadas)).toBe(0)
    })
  })

  it('el profesor lee las de su universidad pero no las escribe', async () => {
    await comoApp(
      {
        universidadId: ids.norte,
        rol: 'PROFESOR',
        usuarioId: await idDe(PROFESOR),
      },
      async (q) => {
        const filas = await q.query<unknown[]>(
          'SELECT 1 FROM seccion_profesor WHERE seccion_id = $1',
          [ids.s1],
        )
        expect(filas.length).toBeGreaterThan(0)
        await expect(
          q.query(
            `INSERT INTO seccion_profesor (universidad_id, seccion_id, usuario_id)
             VALUES ($1, $2, $3)`,
            [ids.norte, ids.s1, await idDe(profesor3)],
          ),
        ).rejects.toMatchObject({ driverError: { code: SIN_PERMISO } })
      },
    )
  })

  it('un profesor no se asigna escribiendo seccion.profesor_id (el trigger no salta la RLS)', async () => {
    const profesor = await idDe(profesor3)
    await comoApp(
      { universidadId: ids.norte, rol: 'PROFESOR', usuarioId: profesor },
      async (q) => {
        await expect(
          q.query('UPDATE seccion SET profesor_id = $2 WHERE id = $1', [
            ids.s1,
            profesor,
          ]),
        ).rejects.toMatchObject({ driverError: { code: SIN_PERMISO } })
      },
    )
    expect((await vigentes(ids.s1)).map((v) => v.correo)).not.toContain(
      profesor3,
    )
  })

  it('el Administrativo de su universidad escribe (control positivo)', async () => {
    await comoApp(
      { universidadId: ids.norte, rol: 'ADMINISTRATIVO' },
      async (q) => {
        await q.query(
          `INSERT INTO seccion_profesor (universidad_id, seccion_id, usuario_id)
           VALUES ($1, $2, $3)`,
          [ids.norte, ids.s1, await idDe(profesor3)],
        )
      },
    )
  })

  it('el Administrativo de otra universidad no gestiona profesores de Norte por la API (404)', async () => {
    await pedir('post', adminSur, `/api/secciones/${ids.s1}/profesores`, 404, {
      profesorId: await idDe(profesor3),
    })
  })
})
