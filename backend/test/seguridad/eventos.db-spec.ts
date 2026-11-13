import type { INestApplication } from '@nestjs/common'
import { Logger } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { DataSource, type QueryRunner } from 'typeorm'
import { vi } from 'vitest'
import { AppModule } from '../../src/app.module.js'
import { configurarApp } from '../../src/config/configurar-app.js'
import { ROL_APP } from '../../src/database/base-de-datos.service.js'
import { crearSuperadmin } from '../../src/database/crear-superadmin.js'
import { opcionesDataSource } from '../../src/database/data-source.js'
import { ejecutarSeed } from '../../src/database/seed.js'

// SEG-04: registro de solo adición de inicios de sesión y acciones sensibles.
// Base propia con el seed cargado, que se crea y se borra en cada ejecución.
const BD_TEST = `${process.env.POSTGRES_TEST_DB ?? 'cursus_test'}_eventos`
const BD_ORIGINAL = process.env.POSTGRES_DB
const PASSWORD = 'password-de-prueba'
const SECRETO = 'origen-solo-para-tests'
const SIN_PERMISO = '42501'
const CHECK = '23514'

const ALUMNO = 'alumno@norte.cursus.test'
const PROFESOR = 'profesor@norte.cursus.test'
const AYUDANTE = 'ayudante@norte.cursus.test'
const ADMIN = 'administrativo.ingenieria@norte.cursus.test'
const DIRECTOR = 'director@norte.cursus.test'

let admin: DataSource
let bd: DataSource
let app: INestApplication<App>
let appSinProxy: INestApplication<App>

async function crearApp(secretoOrigen: string) {
  const modulo = await Test.createTestingModule({
    imports: [AppModule],
  }).compile()
  const nueva = modulo.createNestApplication<INestApplication<App>>({
    logger: false,
  })
  configurarApp(nueva, { secretoOrigen })
  await nueva.init()
  return nueva
}

// Con el proxy de confianza: el secreto de origen y la IP del cliente.
const login = (correo: string, password = 'incorrecta', ip = '203.0.113.7') =>
  request(app.getHttpServer())
    .post('/api/auth/login')
    .set('x-origin-secret', SECRETO)
    .set('x-vercel-forwarded-for', ip)
    .send({ correo, password })

interface Evento {
  id: string
  tipo: string
  resultado: string
  usuario_id: string | null
  universidad_id: string | null
  fecha: Date
  ip: string | null
  detalle: Record<string, unknown>
}

const eventos = (donde = 'true', parametros: unknown[] = []) =>
  bd.query<Evento[]>(
    `SELECT id, tipo, resultado, usuario_id, universidad_id, fecha,
            host(ip) AS ip, detalle
       FROM evento_auditoria WHERE ${donde} ORDER BY fecha, id`,
    parametros,
  )

// Solo el test puede vaciar la tabla: desactiva un instante el trigger de
// borrado, como dueño, en la base de prueba.
async function vaciarEventos() {
  await bd.query(
    'ALTER TABLE evento_auditoria DISABLE TRIGGER tg_evento_auditoria_inmutable',
  )
  await bd.query('DELETE FROM evento_auditoria')
  await bd.query(
    'ALTER TABLE evento_auditoria ENABLE TRIGGER tg_evento_auditoria_inmutable',
  )
}

const idDe = async (correo: string) =>
  (
    await bd.query<{ id: string }[]>(
      'SELECT id FROM usuario WHERE correo = $1',
      [correo],
    )
  )[0].id

const universidadDe = async (correo: string) =>
  (
    await bd.query<{ universidad_id: string }[]>(
      'SELECT universidad_id FROM usuario WHERE correo = $1',
      [correo],
    )
  )[0].universidad_id

async function comoApp(
  sesion: { rol: string; universidadId: string; usuarioId?: string },
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
    if (sesion.usuarioId) {
      await q.query(`SELECT set_config('app.usuario_id', $1, true)`, [
        sesion.usuarioId,
      ])
    }
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
  process.env.POSTGRES_DB = BD_TEST
  app = await crearApp(SECRETO)
  appSinProxy = await crearApp('')
})

beforeEach(async () => {
  await bd.query('TRUNCATE limite_login')
  await vaciarEventos()
})

afterAll(async () => {
  await app?.close()
  await appSinProxy?.close()
  process.env.POSTGRES_DB = BD_ORIGINAL
  await bd?.destroy()
  if (admin?.isInitialized) {
    await admin.query(`DROP DATABASE IF EXISTS "${BD_TEST}" WITH (FORCE)`)
    await admin.destroy()
  }
})

describe('registro append-only', () => {
  async function unEvento() {
    await login(ALUMNO, PASSWORD).expect(200)
    return (await eventos())[0]
  }

  it('ni el dueño de la tabla modifica ni borra un evento', async () => {
    const evento = await unEvento()
    await expect(
      bd.query(
        `UPDATE evento_auditoria SET resultado = 'FALLIDO' WHERE id = $1`,
        [evento.id],
      ),
    ).rejects.toMatchObject({ code: SIN_PERMISO })
    await expect(
      bd.query('DELETE FROM evento_auditoria WHERE id = $1', [evento.id]),
    ).rejects.toMatchObject({ code: SIN_PERMISO })
    expect(await eventos()).toEqual([evento])
  })

  it('la API no tiene INSERT, UPDATE, DELETE ni TRUNCATE: solo lee', async () => {
    const [{ privilegios }] = await bd.query<{ privilegios: string }[]>(
      `SELECT string_agg(privilege_type, ',' ORDER BY privilege_type) AS privilegios
         FROM information_schema.role_table_grants
        WHERE table_name = 'evento_auditoria' AND grantee = '${ROL_APP}'`,
    )
    expect(privilegios).toBe('SELECT')
    const evento = await unEvento()
    const universidadId = await universidadDe(DIRECTOR)
    await comoApp({ rol: 'DIRECTOR', universidadId }, async (q) => {
      for (const sql of [
        `INSERT INTO evento_auditoria (tipo, resultado) VALUES ('INICIO_SESION', 'FALLIDO')`,
        `UPDATE evento_auditoria SET resultado = 'FALLIDO'`,
        'DELETE FROM evento_auditoria',
      ]) {
        await q.query('SAVEPOINT s')
        await expect(q.query(sql)).rejects.toMatchObject({ code: SIN_PERMISO })
        await q.query('ROLLBACK TO SAVEPOINT s')
      }
      const filas: unknown = await q.query(`SELECT id FROM evento_auditoria`)
      expect(filas).toEqual([{ id: evento.id }])
    })
  })

  it('las funciones que escriben no son públicas', async () => {
    // Sin ACL (nulo) o con un permiso para PUBLIC (grantee 0), cualquiera la
    // ejecuta.
    const [{ publicas, aplicacion }] = await bd.query<
      { publicas: string; aplicacion: boolean }[]
    >(
      `SELECT count(*) FILTER (WHERE p.proacl IS NULL
                                OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) a
                                            WHERE a.grantee = 0)) AS publicas,
              has_function_privilege('${ROL_APP}',
                'public.registrar_inicio_sesion(text, inet, text, uuid, text)', 'EXECUTE') AS aplicacion
         FROM pg_proc p
        WHERE p.proname IN ('registrar_inicio_sesion', 'registrar_evento_de_historial')`,
    )
    expect(Number(publicas)).toBe(0)
    expect(aplicacion).toBe(true)
    // Una función que escribe no admite resultados inventados ni claves de
    // detalle fuera de las cuatro conocidas.
    await expect(
      bd.query(`SELECT registrar_inicio_sesion('a@b.c', NULL, 'INVENTADO')`),
    ).rejects.toMatchObject({ code: CHECK })
    await expect(
      bd.query(
        `INSERT INTO evento_auditoria (tipo, resultado, detalle)
         VALUES ('INICIO_SESION', 'FALLIDO', '{"password": "x"}')`,
      ),
    ).rejects.toMatchObject({ code: CHECK })
  })
})

describe('inicios de sesión', () => {
  it('un inicio exitoso deja un evento con usuario, universidad, fecha e IP', async () => {
    const antes = Date.now()
    const respuesta = await login(ALUMNO, PASSWORD, '198.51.100.20').expect(200)
    expect(respuesta.body).toEqual({
      accessToken: expect.any(String) as string,
    })
    const [evento] = await eventos()
    expect(evento).toMatchObject({
      tipo: 'INICIO_SESION',
      resultado: 'EXITOSO',
      usuario_id: await idDe(ALUMNO),
      universidad_id: await universidadDe(ALUMNO),
      ip: '198.51.100.20',
      detalle: {},
    })
    expect(evento.fecha.getTime()).toBeGreaterThanOrEqual(antes - 2000)
    expect(await eventos()).toHaveLength(1)
  })

  it.each([
    ['contraseña incorrecta de una cuenta existente', ALUMNO, true],
    ['cuenta inexistente', 'no-existe@norte.cursus.test', false],
    ['dominio que no es de ninguna universidad', 'x@otro.dominio.test', false],
  ])(
    'un fallo (%s) deja un evento y responde igual',
    async (_caso, correo, existe) => {
      const respuesta = await login(correo, 'Contrasena-incorrecta-1')
      expect(respuesta.status).toBe(401)
      expect(respuesta.body).toMatchObject({
        message: 'Credenciales inválidas',
      })
      const [evento] = await eventos()
      expect(evento).toMatchObject({
        tipo: 'INICIO_SESION',
        resultado: 'FALLIDO',
        ip: '203.0.113.7',
        usuario_id: existe ? await idDe(correo) : null,
        universidad_id: existe ? await universidadDe(correo) : null,
      })
      expect(await eventos()).toHaveLength(1)
    },
  )

  it('un éxito registra la cuenta que resolvió el login aunque el correo venga con espacios o mayúsculas', async () => {
    // El login normaliza con trim() de JS (también tabuladores y saltos de
    // línea) y en minúsculas: el evento guarda el id que resolvió esa regla.
    await login(`\t ${ALUMNO.toUpperCase()}\n`, PASSWORD).expect(200)
    expect(await eventos()).toMatchObject([
      {
        resultado: 'EXITOSO',
        usuario_id: await idDe(ALUMNO),
        universidad_id: await universidadDe(ALUMNO),
      },
    ])
  })

  it('un fallo con el correo entre tabuladores resuelve la misma cuenta que el login', async () => {
    await login(`\t${ALUMNO}\n`).expect(401)
    expect((await eventos())[0]).toMatchObject({
      resultado: 'FALLIDO',
      usuario_id: await idDe(ALUMNO),
    })
  })

  it('un éxito conserva el id de la cuenta aunque se archive antes de registrarlo', async () => {
    // El login ya emitió la sesión; la cuenta se archiva antes del registro.
    // La función recibe el id resuelto, no vuelve a buscar por correo.
    const id = await idDe(AYUDANTE)
    await bd.query(`UPDATE usuario SET archived_at = now() WHERE id = $1`, [id])
    await bd.query(
      `SELECT registrar_inicio_sesion(NULL, '198.51.100.9', 'EXITOSO', $1)`,
      [id],
    )
    expect(await eventos()).toMatchObject([
      {
        resultado: 'EXITOSO',
        usuario_id: id,
        universidad_id: await universidadDe(AYUDANTE),
        ip: '198.51.100.9',
      },
    ])
  })

  it('una cuenta archivada responde y se registra como una inexistente', async () => {
    const inexistente = await login('no-existe@norte.cursus.test', PASSWORD)
    await bd.query(`UPDATE usuario SET archived_at = now() WHERE correo = $1`, [
      AYUDANTE,
    ])
    const archivada = await login(AYUDANTE, PASSWORD)
    expect(archivada.status).toBe(inexistente.status)
    expect(archivada.body).toEqual(inexistente.body)
    const [a, b] = await eventos()
    expect([a.resultado, b.resultado]).toEqual(['FALLIDO', 'FALLIDO'])
    expect([a.usuario_id, b.usuario_id]).toEqual([null, null])
    expect([a.universidad_id, b.universidad_id]).toEqual([null, null])
  })

  it('la credencial provisoria queda marcada en el detalle', async () => {
    await bd.query(
      `UPDATE usuario SET credencial_provisoria = true WHERE correo = $1`,
      [PROFESOR],
    )
    await login(PROFESOR, PASSWORD).expect(200)
    expect((await eventos())[0]).toMatchObject({
      resultado: 'EXITOSO',
      detalle: { credencialProvisoria: true },
    })
  })

  it('el límite de intentos registra los fallos y el bloqueo con la cuenta, sin cambiar la respuesta', async () => {
    for (let i = 0; i < 4; i++) await login(ALUMNO).expect(401)
    const bloqueado = await login(ALUMNO)
    expect(bloqueado.status).toBe(429)
    expect(Number(bloqueado.headers['retry-after'])).toBeGreaterThan(0)
    // Aunque la contraseña sea la correcta, sigue bloqueado.
    await login(ALUMNO, PASSWORD).expect(429)
    expect((await eventos()).map((e) => e.resultado)).toEqual([
      'FALLIDO',
      'FALLIDO',
      'FALLIDO',
      'FALLIDO',
      'BLOQUEADO',
      'BLOQUEADO',
    ])
    const usuarioId = await idDe(ALUMNO)
    expect((await eventos()).every((e) => e.usuario_id === usuarioId)).toBe(
      true,
    )
  })

  it('un superadmin (sin universidad) queda con usuario y sin universidad', async () => {
    const { id } = await crearSuperadmin(bd, {
      correo: 'super@cursus.test',
      nombre: 'Superadmin',
      password: 'contraseña-provisoria-1',
    })
    await login('Super@Cursus.test ', 'contraseña-provisoria-1').expect(200)
    expect((await eventos())[0]).toMatchObject({
      resultado: 'EXITOSO',
      usuario_id: id,
      universidad_id: null,
    })
  })

  it('un body inválido no llega al registro', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('x-origin-secret', SECRETO)
      .send({ correo: '', password: '' })
      .expect(400)
    expect(await eventos()).toEqual([])
  })
})

describe('IP', () => {
  it('con el proxy de confianza toma x-vercel-forwarded-for', async () => {
    await login(ALUMNO, PASSWORD, '2001:db8::5').expect(200)
    expect((await eventos())[0].ip).toBe('2001:db8::5')
  })

  it('sin la configuración de proxy ignora la cabecera que envía el cliente', async () => {
    await request(app.getHttpServer()) // ya validado arriba; control de la cabecera
      .post('/api/auth/login')
      .set('x-origin-secret', SECRETO)
      .send({ correo: ALUMNO, password: PASSWORD })
      .expect(200)
    // Sin cabecera de proxy no hay IP confiable.
    expect((await eventos())[0].ip).toBeNull()
    await vaciarEventos()
    await bd.query('TRUNCATE limite_login')
    await request(appSinProxy.getHttpServer())
      .post('/api/auth/login')
      .set('x-vercel-forwarded-for', '203.0.113.99')
      .send({ correo: ALUMNO, password: PASSWORD })
      .expect(200)
    const [evento] = await eventos()
    expect(evento.ip).not.toBe('203.0.113.99')
    expect(['127.0.0.1', '::1']).toContain(evento.ip)
  })
})

describe('privacidad', () => {
  it('no guarda el correo digitado ni la contraseña, aunque se pegue en el campo del correo', async () => {
    const pegada = 'Sup3r-Secreta-Pegada-2026!'
    await login(pegada, pegada).expect(401)
    await login('persona.inventada@norte.cursus.test', 'otra-Clave-9').expect(
      401,
    )
    await login(ALUMNO, 'mala-clave-del-alumno').expect(401)
    await login(ALUMNO, PASSWORD).expect(200)
    const todo = JSON.stringify(
      await bd.query('SELECT * FROM evento_auditoria ORDER BY id'),
    )
    for (const prohibido of [
      pegada,
      'persona.inventada',
      'otra-Clave-9',
      'mala-clave-del-alumno',
      PASSWORD,
      ALUMNO,
      'argon2',
      'refresh',
    ]) {
      expect(todo).not.toContain(prohibido)
    }
    // La tabla no tiene columnas de texto libre para eso.
    const columnas = await bd.query<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'evento_auditoria' ORDER BY ordinal_position`,
    )
    expect(columnas.map((c) => c.column_name)).toEqual([
      'id',
      'tipo',
      'resultado',
      'usuario_id',
      'universidad_id',
      'fecha',
      'ip',
      'detalle',
    ])
  })
})

describe('un fallo al registrar no tumba el login', () => {
  async function conTablaCaida<T>(prueba: () => Promise<T>) {
    await bd.query('ALTER TABLE evento_auditoria RENAME TO evento_auditoria_x')
    try {
      return await prueba()
    } finally {
      await bd.query(
        'ALTER TABLE evento_auditoria_x RENAME TO evento_auditoria',
      )
    }
  }

  it('el login responde igual y el log del servidor lleva un mensaje fijo, sin lo digitado', async () => {
    const error = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {})
    try {
      await conTablaCaida(async () => {
        await login(ALUMNO, PASSWORD).expect(200)
        const mala = await login(ALUMNO)
        expect(mala.status).toBe(401)
        expect(mala.body).toMatchObject({ message: 'Credenciales inválidas' })
      })
      expect(error).toHaveBeenCalledTimes(2)
      const mensajes = error.mock.calls.map((c) => String(c[0])).join('\n')
      expect(mensajes).toContain('No se pudo registrar el inicio de sesión')
      expect(mensajes).toContain('SQLSTATE 42P01')
      expect(mensajes).not.toContain(ALUMNO)
      expect(mensajes).not.toContain(PASSWORD)
    } finally {
      error.mockRestore()
    }
    expect(await eventos()).toEqual([])
  })

  it('el trigger de una acción sensible no tumba la operación', async () => {
    await conTablaCaida(async () => {
      await expect(insertarAsignacion()).resolves.toBeDefined()
    })
    expect(await eventos()).toEqual([])
    const [{ filas }] = await bd.query<{ filas: string }[]>(
      'SELECT count(*) AS filas FROM asignacion_cambio',
    )
    expect(Number(filas)).toBeGreaterThan(0)
  })
})

// Una sección de Norte; con n, la de otro curso (cada prueba que cierra un
// curso usa uno distinto, porque un curso cerrado bloquea sus notas).
async function seccionNorte(n = 0) {
  const [{ id, curso_id: cursoId, universidad_id: universidadId }] =
    await bd.query<{ id: string; curso_id: string; universidad_id: string }[]>(
      `SELECT * FROM (
         SELECT DISTINCT ON (s.curso_id) s.id, s.curso_id, s.universidad_id
           FROM seccion s JOIN universidad u ON u.id = s.universidad_id
          WHERE u.dominio_correo = 'norte.cursus.test' AND s.archived_at IS NULL
          ORDER BY s.curso_id, s.id) d
        ORDER BY d.curso_id OFFSET $1 LIMIT 1`,
      [n],
    )
  return { id, cursoId, universidadId }
}

async function insertarAsignacion(tipo = 'PROFESOR') {
  const s = await seccionNorte()
  const [{ id }] = await bd.query<{ id: string }[]>(
    `INSERT INTO asignacion_cambio
       (universidad_id, seccion_id, tipo, anterior_id, nuevo_id, responsable_id, motivo)
     VALUES ($1, $2, $3, NULL, $4, $5, 'Motivo que no debe copiarse') RETURNING id`,
    [s.universidadId, s.id, tipo, await idDe(PROFESOR), await idDe(ADMIN)],
  )
  return id
}

describe('acciones sensibles', () => {
  it('una asignación de profesor o ayudante deja un evento con su autor y su fecha', async () => {
    const profesor = await insertarAsignacion('PROFESOR')
    const ayudante = await insertarAsignacion('AYUDANTE')
    const [a, b] = await eventos()
    expect(a).toMatchObject({
      tipo: 'ASIGNACION',
      resultado: 'EXITOSO',
      usuario_id: await idDe(ADMIN),
      universidad_id: await universidadDe(ADMIN),
      ip: null,
      detalle: {
        subtipo: 'PROFESOR',
        origen: 'asignacion_cambio',
        origenId: profesor,
      },
    })
    expect(b.detalle).toEqual({
      subtipo: 'AYUDANTE',
      origen: 'asignacion_cambio',
      origenId: ayudante,
    })
    // La fecha es la de la acción, y el motivo no se copia.
    const [{ fecha }] = await bd.query<{ fecha: Date }[]>(
      'SELECT fecha FROM asignacion_cambio WHERE id = $1',
      [profesor],
    )
    expect(a.fecha).toEqual(fecha)
    expect(JSON.stringify(a)).not.toContain('Motivo')
  })

  // Como lo hace la API: con el rol de la aplicación, que no puede escribir en
  // evento_auditoria. Escribe el trigger SECURITY DEFINER.
  it('una asignación hecha con el rol de la aplicación también deja su evento', async () => {
    const s = await seccionNorte()
    const administrativo = await idDe(ADMIN)
    await comoApp(
      {
        rol: 'ADMINISTRATIVO',
        universidadId: s.universidadId,
        usuarioId: administrativo,
      },
      async (q) => {
        await q.query(
          `INSERT INTO asignacion_cambio
             (universidad_id, seccion_id, tipo, nuevo_id, responsable_id, motivo)
           VALUES ($1, $2, 'AYUDANTE', $3, $4, 'Prueba')`,
          [s.universidadId, s.id, await idDe(AYUDANTE), administrativo],
        )
        // Sin cambiar de rol, el administrativo no lee el registro.
        expect(await q.query('SELECT id FROM evento_auditoria')).toEqual([])
        await q.query(`SELECT set_config('app.rol', 'DIRECTOR', true)`)
        expect(
          await q.query('SELECT tipo, usuario_id FROM evento_auditoria'),
        ).toEqual([{ tipo: 'ASIGNACION', usuario_id: administrativo }])
      },
    )
  })

  it('el cierre de un curso deja un evento', async () => {
    const s = await seccionNorte(1)
    await bd.query(
      `INSERT INTO cierre_curso (id, universidad_id, responsable_id)
       VALUES ($1, $2, $3)`,
      [s.cursoId, s.universidadId, await idDe(ADMIN)],
    )
    expect(await eventos()).toMatchObject([
      {
        tipo: 'CIERRE_CURSO',
        resultado: 'EXITOSO',
        usuario_id: await idDe(ADMIN),
        universidad_id: s.universidadId,
        detalle: { origen: 'cierre_curso', origenId: s.cursoId },
      },
    ])
  })

  it('de las notas solo registra la aprobación, la devolución y la recorrección, sin sus valores', async () => {
    const s = await seccionNorte()
    const alumno = await idDe(ALUMNO)
    const profesor = await idDe(PROFESOR)
    const [{ id: evaluacion }] = await bd.query<{ id: string }[]>(
      `INSERT INTO evaluacion (universidad_id, seccion_id, nombre, fecha, ponderacion, creada_por)
       SELECT s.universidad_id, s.id, 'Control SEG-04', p.fecha_inicio, 100, $2
         FROM seccion s JOIN curso c ON c.id = s.curso_id
         JOIN periodo p ON p.id = c.periodo_id WHERE s.id = $1
       RETURNING id`,
      [s.id, profesor],
    )
    const cambio = async (
      tipo: string,
      alumnoId: string | null,
      anterior: number | null,
      nueva: number | null,
      motivo: string | null,
    ) =>
      (
        await bd.query<{ id: string }[]>(
          `INSERT INTO nota_cambio
             (universidad_id, evaluacion_id, alumno_id, tipo, nota_anterior, nota_nueva, motivo, responsable_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
          [
            s.universidadId,
            evaluacion,
            alumnoId,
            tipo,
            anterior,
            nueva,
            motivo,
            profesor,
          ],
        )
      )[0].id
    await cambio('PROPUESTA', alumno, null, 5.5, null)
    await cambio('ENVIO', null, null, null, null)
    const aprobacion = await cambio('APROBACION', null, null, null, null)
    const devolucion = await cambio('DEVOLUCION', null, null, null, 'Revisar')
    const recorreccion = await cambio(
      'RECORRECCION',
      alumno,
      4.0,
      5.5,
      'Error de digitación',
    )
    const lista = await eventos()
    expect(
      lista.map((e) => [e.tipo, e.detalle.subtipo, e.detalle.origenId]),
    ).toEqual([
      ['CAMBIO_NOTA', 'APROBACION', aprobacion],
      ['CAMBIO_NOTA', 'DEVOLUCION', devolucion],
      ['CAMBIO_NOTA', 'RECORRECCION', recorreccion],
    ])
    expect(lista.every((e) => e.usuario_id === profesor)).toBe(true)
    const texto = JSON.stringify(lista)
    for (const sensible of [
      '5.5',
      '4.0',
      'Error de digitación',
      'Revisar',
      alumno,
    ]) {
      expect(texto).not.toContain(sensible)
    }
  })
})

describe('lectura para SEG-05', () => {
  it('solo el Director y el superadmin leen; el resto no ve ninguna fila', async () => {
    await login(ALUMNO, PASSWORD).expect(200)
    await login(ALUMNO).expect(401)
    const universidadId = await universidadDe(ALUMNO)
    for (const [correo, rol] of [
      [PROFESOR, 'PROFESOR'],
      [AYUDANTE, 'AYUDANTE'],
      [ALUMNO, 'ALUMNO'],
      [ADMIN, 'ADMINISTRATIVO'],
    ] as const) {
      await comoApp(
        { rol, universidadId, usuarioId: await idDe(correo) },
        async (q) => {
          expect(await q.query('SELECT id FROM evento_auditoria')).toEqual([])
        },
      )
    }
    for (const rol of ['DIRECTOR', 'SUPERADMIN']) {
      await comoApp({ rol, universidadId }, async (q) => {
        expect(await q.query('SELECT id FROM evento_auditoria')).toHaveLength(2)
      })
    }
  })

  it('se filtra por usuario, universidad, tipo y fechas, del más reciente al más antiguo y paginado', async () => {
    const norte = await universidadDe(ALUMNO)
    const sur = await universidadDe('profesor@sur.cursus.test')
    const alumno = await idDe(ALUMNO)
    const insertar = (
      tipo: string,
      resultado: string,
      usuario: string | null,
      universidad: string | null,
      fecha: string,
    ) =>
      bd.query(
        `INSERT INTO evento_auditoria (tipo, resultado, usuario_id, universidad_id, fecha)
         VALUES ($1, $2, $3, $4, $5)`,
        [tipo, resultado, usuario, universidad, fecha],
      )
    await insertar(
      'INICIO_SESION',
      'EXITOSO',
      alumno,
      norte,
      '2026-03-01T10:00:00Z',
    )
    await insertar(
      'INICIO_SESION',
      'FALLIDO',
      null,
      null,
      '2026-03-02T10:00:00Z',
    )
    await insertar(
      'INICIO_SESION',
      'FALLIDO',
      alumno,
      norte,
      '2026-03-03T10:00:00Z',
    )
    await insertar(
      'INICIO_SESION',
      'EXITOSO',
      await idDe('profesor@sur.cursus.test'),
      sur,
      '2026-03-04T10:00:00Z',
    )
    await insertar(
      'CIERRE_CURSO',
      'EXITOSO',
      await idDe(ADMIN),
      norte,
      '2026-03-05T10:00:00Z',
    )
    const listar = (
      donde: string,
      parametros: unknown[],
      limite = 50,
      cursor: [Date, string] | null = null,
    ) =>
      comoApp({ rol: 'DIRECTOR', universidadId: norte }, async (q) => {
        const filas = (await q.query(
          `SELECT id, tipo, resultado, fecha FROM evento_auditoria
            WHERE ${donde}
              ${cursor ? `AND (fecha, id) < ($${parametros.length + 1}, $${parametros.length + 2})` : ''}
            ORDER BY fecha DESC, id DESC LIMIT ${limite}`,
          cursor ? [...parametros, ...cursor] : parametros,
        )) as { fecha: Date; tipo: string; resultado: string }[]
        resultadoListado = filas
      })
    let resultadoListado: {
      id?: string
      fecha: Date
      tipo: string
      resultado: string
    }[] = []

    await listar('true', [])
    expect(
      resultadoListado.map((e) => e.fecha.toISOString().slice(5, 10)),
    ).toEqual(['03-05', '03-04', '03-03', '03-02', '03-01'])
    await listar('usuario_id = $1', [alumno])
    expect(resultadoListado).toHaveLength(2)
    await listar('universidad_id = $1', [sur])
    expect(resultadoListado).toHaveLength(1)
    await listar('tipo = $1', ['CIERRE_CURSO'])
    expect(resultadoListado.map((e) => e.tipo)).toEqual(['CIERRE_CURSO'])
    await listar('fecha >= $1 AND fecha < $2', [
      '2026-03-02T00:00:00Z',
      '2026-03-04T00:00:00Z',
    ])
    expect(resultadoListado.map((e) => e.resultado)).toEqual([
      'FALLIDO',
      'FALLIDO',
    ])
    // Paginación por cursor: dos páginas de dos y una de uno, sin repetir.
    await listar('true', [], 2)
    const primera = resultadoListado
    await listar('true', [], 2, [primera[1].fecha, primera[1].id as string])
    const segunda = resultadoListado
    await listar('true', [], 2, [segunda[1].fecha, segunda[1].id as string])
    expect(
      [...primera, ...segunda, ...resultadoListado].map((e) =>
        e.fecha.toISOString().slice(5, 10),
      ),
    ).toEqual(['03-05', '03-04', '03-03', '03-02', '03-01'])
  })
})
