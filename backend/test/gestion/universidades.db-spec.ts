import type { FacultadElegible, UniversidadElegible } from '@cursus/shared'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { DataSource, type QueryRunner } from 'typeorm'
import { AppModule } from '../../src/app.module.js'
import type { RespuestaLogin } from '../../src/auth/auth.controller.js'
import { configurarApp } from '../../src/config/configurar-app.js'
import { ROL_APP } from '../../src/database/base-de-datos.service.js'
import { crearSuperadmin } from '../../src/database/crear-superadmin.js'
import { opcionesDataSource } from '../../src/database/data-source.js'
import { ejecutarSeed, UNIVERSIDADES } from '../../src/database/seed.js'

// GES-23: el superadmin crea, edita y archiva universidades y facultades desde
// su vista global. Base propia con el seed y un superadmin.

const BD_TEST = `${process.env.POSTGRES_TEST_DB ?? 'cursus_test'}_universidades`
const BD_ORIGINAL = process.env.POSTGRES_DB
const PASSWORD = 'contraseña-de-prueba'
const SUPERADMIN = 'superadmin@cursus.test'

const [NORTE, SUR] = UNIVERSIDADES.map((u) => u.dominio)
const ADMIN_INGENIERIA_NORTE = `administrativo.ingenieria@${NORTE}`

let admin: DataSource
let bd: DataSource
let app: INestApplication<App>
let token: string

function login(correo: string, password = PASSWORD) {
  return request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ correo, password })
}

async function tokenDe(correo: string): Promise<string> {
  const respuesta = await login(correo).expect(200)
  return (respuesta.body as RespuestaLogin).accessToken
}

const pedir = (
  metodo: 'get' | 'post' | 'put' | 'patch',
  ruta: string,
  conToken = token,
) =>
  request(app.getHttpServer())
    [metodo](ruta)
    .set('Authorization', `Bearer ${conToken}`)

const listar = async () =>
  (await pedir('get', '/api/superadmin/universidades').expect(200))
    .body as UniversidadElegible[]

const crear = (datos: Record<string, unknown>) =>
  pedir('post', '/api/superadmin/universidades').send(datos)

let numero = 0
// Datos válidos de una universidad nueva, distintos en cada llamada.
function nueva(): { nombre: string; dominioCorreo: string; color: string } {
  numero += 1
  return {
    nombre: `Universidad Nueva ${numero}`,
    dominioCorreo: `nueva${numero}.cl`,
    color: '#aa3300',
  }
}

async function crearUniversidad(): Promise<UniversidadElegible> {
  return (await crear(nueva()).expect(201)).body as UniversidadElegible
}

async function crearFacultad(
  universidadId: string,
  nombre: string,
): Promise<FacultadElegible> {
  return (
    await pedir(
      'post',
      `/api/superadmin/universidades/${universidadId}/facultades`,
    )
      .send({ nombre })
      .expect(201)
  ).body as FacultadElegible
}

const idDe = async (dominio: string) => {
  const [{ id }] = await bd.query<{ id: string }[]>(
    'SELECT id FROM universidad WHERE dominio_correo = $1',
    [dominio],
  )
  return id
}

// Auditoría del superadmin (MT-04) de un registro, de la más reciente a la
// más antigua.
const auditoria = (registroId: string) =>
  bd.query<{ tabla: string; operacion: string }[]>(
    `SELECT tabla, operacion FROM superadmin_cambio
      WHERE registro_id = $1 ORDER BY fecha DESC, id DESC`,
    [registroId],
  )

beforeAll(async () => {
  admin = await new DataSource(opcionesDataSource()).initialize()
  await admin.query(`DROP DATABASE IF EXISTS "${BD_TEST}" WITH (FORCE)`)
  await admin.query(`CREATE DATABASE "${BD_TEST}"`)
  bd = await new DataSource(opcionesDataSource(BD_TEST)).initialize()
  await bd.runMigrations()
  await ejecutarSeed(bd, PASSWORD)
  await crearSuperadmin(bd, {
    correo: SUPERADMIN,
    nombre: 'Superadmin',
    password: PASSWORD,
  })
  // La contraseña provisoria la cubre MT-04 (superadmin.db-spec).
  await bd.query(
    `UPDATE usuario SET credencial_provisoria = false WHERE rol = 'SUPERADMIN'`,
  )

  process.env.POSTGRES_DB = BD_TEST
  const modulo = await Test.createTestingModule({
    imports: [AppModule],
  }).compile()
  app = modulo.createNestApplication<INestApplication<App>>({ logger: false })
  configurarApp(app, { secretoOrigen: '' })
  await app.init()
  token = await tokenDe(SUPERADMIN)
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

describe('universidades', () => {
  it('crea una universidad con nombre, dominio y color, sin elegir una facultad', async () => {
    const respuesta = await crear({
      nombre: '  Universidad   del Pacífico ',
      dominioCorreo: ' Pacifico.CL ',
      color: '#AA3300',
    }).expect(201)

    const creada = respuesta.body as UniversidadElegible
    expect(creada).toEqual({
      id: expect.any(String) as string,
      nombre: 'Universidad del Pacífico',
      dominioCorreo: 'pacifico.cl',
      color: '#aa3300',
      facultades: [],
    })
    expect(await listar()).toContainEqual(creada)
    // Queda auditada como cambio del superadmin.
    expect(await auditoria(creada.id)).toEqual([
      { tabla: 'universidad', operacion: 'INSERT' },
    ])
  })

  it('las universidades existentes tienen el color de CURSUS', async () => {
    const norte = (await listar()).find((u) => u.dominioCorreo === NORTE)
    expect(norte?.color).toBe('#1b4f72')
  })

  it.each([
    ['sin nombre', { nombre: '  ' }],
    ['un dominio con @', { dominioCorreo: '@nueva.cl' }],
    ['un dominio sin punto', { dominioCorreo: 'localhost' }],
    ['un color sin #', { color: 'aa3300' }],
    ['un color con nombre', { color: 'red' }],
  ])('rechaza %s (400)', async (_caso, invalido) => {
    await crear({ ...nueva(), ...invalido }).expect(400)
  })

  it.each([
    ['un nombre repetido, sin distinguir mayúsculas ni espacios', 'nombre'],
    ['un dominio repetido', 'dominio'],
  ])('rechaza %s (409)', async (_caso, campo) => {
    const existente = await crearUniversidad()
    const respuesta = await crear({
      ...nueva(),
      ...(campo === 'nombre'
        ? { nombre: ` ${existente.nombre.toUpperCase()}  ` }
        : { dominioCorreo: existente.dominioCorreo }),
    }).expect(409)
    expect(respuesta.body).toMatchObject({
      message: `Ya existe una universidad con ese ${campo}`,
    })
  })

  it('rechaza el dominio del correo de un superadmin (409)', async () => {
    const respuesta = await crear({
      ...nueva(),
      dominioCorreo: 'cursus.test',
    }).expect(409)
    expect(respuesta.body).toMatchObject({
      message: 'Ese dominio es el del correo de un superadmin',
    })
  })

  it('edita el nombre, el color y, sin usuarios, el dominio', async () => {
    const universidad = await crearUniversidad()

    const respuesta = await pedir(
      'patch',
      `/api/superadmin/universidades/${universidad.id}`,
    )
      .send({ nombre: 'Universidad Renombrada', color: '#003366' })
      .expect(200)
    expect(respuesta.body).toMatchObject({
      nombre: 'Universidad Renombrada',
      dominioCorreo: universidad.dominioCorreo,
      color: '#003366',
    })

    await pedir('patch', `/api/superadmin/universidades/${universidad.id}`)
      .send({ dominioCorreo: 'renombrada.cl' })
      .expect(200)
    expect(
      (await listar()).find((u) => u.id === universidad.id)?.dominioCorreo,
    ).toBe('renombrada.cl')
  })

  it('no cambia el dominio de una universidad con usuarios: dejarían de iniciar sesión (409)', async () => {
    const norte = await idDe(NORTE)

    const respuesta = await pedir(
      'patch',
      `/api/superadmin/universidades/${norte}`,
    )
      .send({ dominioCorreo: 'otro-norte.cl' })
      .expect(409)
    expect(respuesta.body).toMatchObject({
      message: expect.stringContaining(
        'No se puede cambiar el dominio de una universidad con usuarios',
      ) as string,
    })
    // Sus usuarios siguen entrando, y el resto de sus datos se puede editar.
    await login(ADMIN_INGENIERIA_NORTE).expect(200)
    await pedir('patch', `/api/superadmin/universidades/${norte}`)
      .send({ color: '#0a5c36' })
      .expect(200)
  })

  it('rechaza una edición vacía (400) y una universidad que no existe (404)', async () => {
    const universidad = await crearUniversidad()
    await pedir('patch', `/api/superadmin/universidades/${universidad.id}`)
      .send({})
      .expect(400)
    await pedir(
      'patch',
      '/api/superadmin/universidades/00000000-0000-0000-0000-000000000000',
    )
      .send({ color: '#003366' })
      .expect(404)
  })

  it('al archivar deja de aparecer, conserva sus datos y no se edita', async () => {
    const universidad = await crearUniversidad()

    await pedir(
      'patch',
      `/api/superadmin/universidades/${universidad.id}/archivar`,
    ).expect(204)

    expect((await listar()).map((u) => u.id)).not.toContain(universidad.id)
    const [fila] = await bd.query<{ nombre: string; archivada: boolean }[]>(
      `SELECT nombre, archived_at IS NOT NULL AS archivada
         FROM universidad WHERE id = $1`,
      [universidad.id],
    )
    expect(fila).toEqual({ nombre: universidad.nombre, archivada: true })
    await pedir('patch', `/api/superadmin/universidades/${universidad.id}`)
      .send({ color: '#003366' })
      .expect(404)
    await pedir(
      'patch',
      `/api/superadmin/universidades/${universidad.id}/archivar`,
    ).expect(404)
    // El nombre archivado no se reutiliza.
    await crear({ ...nueva(), nombre: universidad.nombre }).expect(409)
  })

  it('los usuarios de una universidad archivada no inician sesión y pierden su sesión', async () => {
    const universidad = await crearUniversidad()
    // Un usuario de esa universidad, con la contraseña del seed.
    await bd.query(
      `INSERT INTO usuario (universidad_id, nombre, correo, password_hash, rol)
       SELECT $1, 'Director Nuevo', $2, password_hash, 'DIRECTOR'
         FROM usuario WHERE correo = $3`,
      [
        universidad.id,
        `director@${universidad.dominioCorreo}`,
        `director@${NORTE}`,
      ],
    )
    const sesion = await tokenDe(`director@${universidad.dominioCorreo}`)
    await pedir('get', '/api/auth/yo', sesion).expect(200)

    await pedir(
      'patch',
      `/api/superadmin/universidades/${universidad.id}/archivar`,
    ).expect(204)

    await login(`director@${universidad.dominioCorreo}`).expect(401)
    await pedir('get', '/api/auth/yo', sesion).expect(401)
  })
})

describe('facultades', () => {
  let universidad: UniversidadElegible

  beforeAll(async () => {
    universidad = await crearUniversidad()
  })

  it('crea una facultad en una universidad y aparece en su lista', async () => {
    const facultad = await crearFacultad(
      universidad.id,
      '  Facultad   de Artes ',
    )

    expect(facultad).toEqual({
      id: expect.any(String) as string,
      nombre: 'Facultad de Artes',
    })
    const lista = (await listar()).find((u) => u.id === universidad.id)
    expect(lista?.facultades).toEqual([facultad])
    expect(await auditoria(facultad.id)).toEqual([
      { tabla: 'facultad', operacion: 'INSERT' },
    ])
  })

  it('un nombre se repite entre universidades, pero no en la misma (409)', async () => {
    await crearFacultad(universidad.id, 'Facultad de Medicina')
    const respuesta = await pedir(
      'post',
      `/api/superadmin/universidades/${universidad.id}/facultades`,
    )
      .send({ nombre: 'FACULTAD DE MEDICINA' })
      .expect(409)
    expect(respuesta.body).toMatchObject({
      message: 'Ya existe una facultad con ese nombre en esta universidad',
    })

    const otra = await crearUniversidad()
    await crearFacultad(otra.id, 'Facultad de Medicina')
  })

  it('edita el nombre de una facultad', async () => {
    const facultad = await crearFacultad(universidad.id, 'Facultad de Leyes')

    const respuesta = await pedir(
      'patch',
      `/api/superadmin/facultades/${facultad.id}`,
    )
      .send({ nombre: 'Facultad de Derecho' })
      .expect(200)
    expect(respuesta.body).toEqual({
      id: facultad.id,
      nombre: 'Facultad de Derecho',
    })
  })

  it('archiva una facultad sin uso: deja de aparecer y conserva sus datos', async () => {
    const facultad = await crearFacultad(universidad.id, 'Facultad Temporal')

    await pedir(
      'patch',
      `/api/superadmin/facultades/${facultad.id}/archivar`,
    ).expect(204)

    const lista = (await listar()).find((u) => u.id === universidad.id)
    expect(lista?.facultades.map((f) => f.id)).not.toContain(facultad.id)
    const [{ archivada }] = await bd.query<{ archivada: boolean }[]>(
      'SELECT archived_at IS NOT NULL AS archivada FROM facultad WHERE id = $1',
      [facultad.id],
    )
    expect(archivada).toBe(true)
    await pedir('patch', `/api/superadmin/facultades/${facultad.id}`)
      .send({ nombre: 'Otra' })
      .expect(404)
  })

  it('no archiva una facultad con carreras o usuarios vigentes (409)', async () => {
    const [{ id }] = await bd.query<{ id: string }[]>(
      `SELECT f.id FROM facultad f JOIN universidad un ON un.id = f.universidad_id
        WHERE un.dominio_correo = $1 AND f.nombre = 'Facultad de Ingeniería'`,
      [NORTE],
    )

    const respuesta = await pedir(
      'patch',
      `/api/superadmin/facultades/${id}/archivar`,
    ).expect(409)
    expect(respuesta.body).toMatchObject({
      message: expect.stringMatching(
        /^No se puede archivar: la facultad tiene \d+ carreras y \d+ usuarios vigentes$/,
      ) as string,
    })
  })

  it('no crea facultades en una universidad archivada (404)', async () => {
    const archivada = await crearUniversidad()
    await pedir(
      'patch',
      `/api/superadmin/universidades/${archivada.id}/archivar`,
    ).expect(204)

    await pedir(
      'post',
      `/api/superadmin/universidades/${archivada.id}/facultades`,
    )
      .send({ nombre: 'Facultad Nueva' })
      .expect(404)
  })
})

describe('solo el superadmin', () => {
  const otrosRoles = UNIVERSIDADES.flatMap((universidad) =>
    universidad.usuarios.map((usuario) => ({
      correo: `${usuario.usuario}@${universidad.dominio}`,
      rol: usuario.rol,
    })),
  )

  it.each(otrosRoles)(
    '$correo ($rol) recibe 403 en todas las rutas',
    async ({ correo }) => {
      const sesion = await tokenDe(correo)
      const norte = await idDe(NORTE)
      const [{ facultad }] = await bd.query<{ facultad: string }[]>(
        'SELECT id AS facultad FROM facultad WHERE universidad_id = $1 LIMIT 1',
        [norte],
      )

      await pedir('post', '/api/superadmin/universidades', sesion)
        .send(nueva())
        .expect(403)
      for (const ruta of [
        `/api/superadmin/universidades/${norte}`,
        `/api/superadmin/universidades/${norte}/archivar`,
        `/api/superadmin/facultades/${facultad}`,
        `/api/superadmin/facultades/${facultad}/archivar`,
      ]) {
        await pedir('patch', ruta, sesion)
          .send({ nombre: 'Otro', color: '#003366' })
          .expect(403)
      }
      await pedir(
        'post',
        `/api/superadmin/universidades/${norte}/facultades`,
        sesion,
      )
        .send({ nombre: 'Otra' })
        .expect(403)
    },
  )

  // Defensa en la base: aunque una ruta lo intentara, la RLS solo deja
  // escribir en universidad y facultad al superadmin en su vista global. El
  // Administrativo sí bloquea la fila de su universidad (GES-02 lo usa para
  // activar un período), pero no la modifica.
  async function comoApp<T>(
    rol: string,
    tarea: (q: QueryRunner, universidad: string) => Promise<T>,
  ): Promise<T> {
    const sur = await idDe(SUR)
    const q = bd.createQueryRunner()
    await q.startTransaction()
    try {
      await q.query(`SET LOCAL ROLE ${ROL_APP}`)
      await q.query(
        `SELECT set_config('app.universidad_id', $1, true),
                set_config('app.rol', $2, true)`,
        [sur, rol],
      )
      return await tarea(q, sur)
    } finally {
      await q.rollbackTransaction()
      await q.release()
    }
  }

  it.each(['ADMINISTRATIVO', 'PROFESOR'])(
    'la RLS no deja al rol %s modificar su universidad',
    async (rol) => {
      await comoApp(rol, async (q, sur) => {
        await expect(
          q.query(`UPDATE universidad SET color = '#000000' WHERE id = $1`, [
            sur,
          ]),
        ).rejects.toThrow('row-level security')
      })
    },
  )

  it('la RLS no deja al Director modificar ninguna universidad', async () => {
    await comoApp('DIRECTOR', async (q, sur) => {
      const [filas] = await q.query<[unknown[], number]>(
        `UPDATE universidad SET color = '#000000' WHERE id = $1 RETURNING id`,
        [sur],
      )
      expect(filas).toEqual([])
    })
  })

  it.each(['ADMINISTRATIVO', 'DIRECTOR', 'PROFESOR'])(
    'la RLS no deja al rol %s crear facultades',
    async (rol) => {
      await comoApp(rol, async (q, sur) => {
        await expect(
          q.query(
            `INSERT INTO facultad (universidad_id, nombre) VALUES ($1, 'X')`,
            [sur],
          ),
        ).rejects.toThrow('row-level security')
      })
    },
  )

  it('el Administrativo bloquea la fila de su universidad (GES-02)', async () => {
    await comoApp('ADMINISTRATIVO', async (q, sur) => {
      const filas = await q.query<{ id: string }[]>(
        'SELECT id FROM universidad WHERE id = $1 FOR UPDATE',
        [sur],
      )
      expect(filas).toEqual([{ id: sur }])
    })
  })
})
