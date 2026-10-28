import type {
  CambioCurso,
  CursoEditable,
  UniversidadElegible,
  UsuarioSesion,
} from '@cursus/shared'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { DataSource } from 'typeorm'
import { AppModule } from '../../src/app.module.js'
import type { RespuestaLogin } from '../../src/auth/auth.controller.js'
import { DEBE_ELEGIR_FACULTAD } from '../../src/auth/universidad-actual.decorator.js'
import { configurarApp } from '../../src/config/configurar-app.js'
import { crearSuperadmin } from '../../src/database/crear-superadmin.js'
import { opcionesDataSource } from '../../src/database/data-source.js'
import { ejecutarSeed, UNIVERSIDADES } from '../../src/database/seed.js'

// MT-04 (ADR 0002): el superadmin por la API. Después del login elige una
// universidad y una facultad, y trabaja en ella con las rutas del
// Administrativo. Los demás roles mantienen su aislamiento.

const BD_TEST = `${process.env.POSTGRES_TEST_DB ?? 'cursus_test'}_superadmin`
const BD_ORIGINAL = process.env.POSTGRES_DB
const PASSWORD = 'contraseña-de-prueba'
const SUPERADMIN = 'superadmin@cursus.test'
const PROVISORIA = 'contraseña-provisoria'
const PASSWORD_SUPERADMIN = 'contraseña-del-superadmin'

const [NORTE, SUR] = UNIVERSIDADES.map((u) => u.dominio)
const ADMIN_INGENIERIA_NORTE = `administrativo.ingenieria@${NORTE}`
const ADMIN_SUR = `administrativo@${SUR}`

let admin: DataSource
let bd: DataSource
let app: INestApplication<App>
let superadminId: string
// Facultades del seed: [universidad, facultad].
let ingenieriaNorte: { universidadId: string; facultadId: string }
let economiaNorte: { universidadId: string; facultadId: string }
let saludSur: { universidadId: string; facultadId: string }

async function login(correo: string, password = PASSWORD): Promise<string> {
  const respuesta = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ correo, password })
    .expect(200)
  return (respuesta.body as RespuestaLogin).accessToken
}

const pedir = (
  metodo: 'get' | 'post' | 'put' | 'patch',
  ruta: string,
  token: string,
) =>
  request(app.getHttpServer())
    [metodo](ruta)
    .set('Authorization', `Bearer ${token}`)

const elegir = (token: string, eleccion: typeof ingenieriaNorte) =>
  pedir('put', '/api/superadmin/contexto', token).send(eleccion)

async function facultad(dominio: string, nombre: string) {
  const [fila] = await bd.query<
    { universidadId: string; facultadId: string }[]
  >(
    `SELECT un.id AS "universidadId", f.id AS "facultadId"
       FROM facultad f JOIN universidad un ON un.id = f.universidad_id
      WHERE un.dominio_correo = $1 AND f.nombre = $2`,
    [dominio, nombre],
  )
  return fila
}

// Sesión nueva del superadmin, ya con su contraseña definitiva.
const loginSuperadmin = () => login(SUPERADMIN, PASSWORD_SUPERADMIN)

beforeAll(async () => {
  admin = await new DataSource(opcionesDataSource()).initialize()
  await admin.query(`DROP DATABASE IF EXISTS "${BD_TEST}" WITH (FORCE)`)
  await admin.query(`CREATE DATABASE "${BD_TEST}"`)
  bd = await new DataSource(opcionesDataSource(BD_TEST)).initialize()
  await bd.runMigrations()
  await ejecutarSeed(bd, PASSWORD)
  ;({ id: superadminId } = await crearSuperadmin(bd, {
    correo: SUPERADMIN,
    nombre: 'Superadmin de prueba',
    password: PROVISORIA,
  }))
  ingenieriaNorte = await facultad(NORTE, 'Facultad de Ingeniería')
  economiaNorte = await facultad(NORTE, 'Facultad de Economía y Negocios')
  saludSur = await facultad(SUR, 'Facultad de Ciencias de la Salud')

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

describe('superadmin creado con el comando', () => {
  // Va primero: los demás tests usan la contraseña definitiva.
  it('debe cambiar su contraseña provisoria antes de continuar (PER-03)', async () => {
    // Entra sin universidad: el correo no es de ningún dominio de universidad.
    const token = await login(SUPERADMIN.toUpperCase(), PROVISORIA)

    const yo = await pedir('get', '/api/auth/yo', token).expect(200)
    expect(yo.body).toMatchObject({
      id: superadminId,
      rol: 'SUPERADMIN',
      universidadId: null,
      universidadNombre: 'CURSUS',
      facultadNombre: null,
      debeCambiarPassword: true,
      periodoActivo: null,
    } satisfies Partial<UsuarioSesion>)
    await pedir('get', '/api/superadmin/universidades', token).expect(403)

    await pedir('put', '/api/auth/password', token)
      .send({ passwordActual: PROVISORIA, passwordNueva: PASSWORD_SUPERADMIN })
      .expect(204)
    await pedir('get', '/api/superadmin/universidades', token).expect(200)
  })
})

describe('elegir universidad y facultad', () => {
  let token: string

  beforeAll(async () => {
    token = await loginSuperadmin()
  })

  it('lista las universidades vigentes con sus facultades vigentes', async () => {
    const respuesta = await pedir(
      'get',
      '/api/superadmin/universidades',
      token,
    ).expect(200)

    const universidades = respuesta.body as UniversidadElegible[]
    expect(universidades.map((u) => u.nombre)).toEqual(
      UNIVERSIDADES.map((u) => u.nombre).sort(),
    )
    for (const universidad of universidades) {
      const seed = UNIVERSIDADES.find((u) => u.nombre === universidad.nombre)
      expect(universidad.facultades.map((f) => f.nombre)).toEqual(
        seed?.facultades.map((f) => f.nombre).sort(),
      )
    }
  })

  it('sin elegir una facultad, las rutas del Administrativo responden 403', async () => {
    const respuesta = await pedir('get', '/api/cursos', token).expect(403)
    expect(respuesta.body).toMatchObject({ message: DEBE_ELEGIR_FACULTAD })
  })

  it('rechaza una facultad de otra universidad (404)', async () => {
    await elegir(token, {
      universidadId: ingenieriaNorte.universidadId,
      facultadId: saludSur.facultadId,
    }).expect(404)
  })

  it('rechaza ids que no son UUID (400)', async () => {
    await elegir(token, { universidadId: 'norte', facultadId: 'x' }).expect(400)
  })

  it('al elegir, responde la sesión con la universidad y la facultad', async () => {
    const respuesta = await elegir(token, ingenieriaNorte).expect(200)
    expect(respuesta.body).toMatchObject({
      rol: 'SUPERADMIN',
      universidadId: ingenieriaNorte.universidadId,
      universidadNombre: UNIVERSIDADES[0].nombre,
      facultadNombre: 'Facultad de Ingeniería',
    })
    // El período activo es el de la universidad elegida.
    expect((respuesta.body as UsuarioSesion).periodoActivo).not.toBeNull()
    const yo = await pedir('get', '/api/auth/yo', token).expect(200)
    expect(yo.body).toEqual(respuesta.body)
  })

  it('cada sesión tiene su propia elección', async () => {
    const otra = await loginSuperadmin()
    await pedir('get', '/api/cursos', otra).expect(403)
  })
})

describe('dentro de la facultad elegida', () => {
  let token: string

  beforeAll(async () => {
    token = await loginSuperadmin()
    await elegir(token, ingenieriaNorte).expect(200)
  })

  it.each(['/api/cursos', '/api/carreras', '/api/periodos'])(
    '%s responde lo mismo que al Administrativo de esa facultad',
    async (ruta) => {
      const delAdministrativo = await pedir(
        'get',
        ruta,
        await login(ADMIN_INGENIERIA_NORTE),
      ).expect(200)
      const delSuperadmin = await pedir('get', ruta, token).expect(200)
      expect(delSuperadmin.body).toEqual(delAdministrativo.body)
    },
  )

  it('crea una carrera en esa facultad y queda auditada', async () => {
    const respuesta = await pedir('post', '/api/carreras', token)
      .send({ nombre: 'Carrera del superadmin' })
      .expect(201)
    const { id } = respuesta.body as { id: string }

    const [carrera] = await bd.query<{ facultad_id: string }[]>(
      'SELECT facultad_id FROM carrera WHERE id = $1',
      [id],
    )
    expect(carrera.facultad_id).toBe(ingenieriaNorte.facultadId)
    const cambios = await bd.query<
      { superadmin_id: string; universidad_id: string; operacion: string }[]
    >(
      `SELECT superadmin_id, universidad_id, operacion FROM superadmin_cambio
        WHERE tabla = 'carrera' AND registro_id = $1`,
      [id],
    )
    expect(cambios).toEqual([
      {
        superadmin_id: superadminId,
        universidad_id: ingenieriaNorte.universidadId,
        operacion: 'INSERT',
      },
    ])
  })

  it('edita un curso y el historial lo muestra como responsable', async () => {
    const [{ id: cursoId }] = await bd.query<{ id: string }[]>(
      `SELECT c.id FROM curso c JOIN carrera ca ON ca.id = c.carrera_id
        WHERE ca.facultad_id = $1 ORDER BY c.codigo LIMIT 1`,
      [ingenieriaNorte.facultadId],
    )
    const edicion = await pedir(
      'get',
      `/api/cursos/${cursoId}/edicion`,
      token,
    ).expect(200)
    const curso = edicion.body as CursoEditable
    await pedir('patch', `/api/cursos/${cursoId}`, token)
      .send({
        codigo: curso.codigo,
        nombre: `${curso.nombre} (editado)`,
        carreraId: curso.carreraId,
        periodoId: curso.periodoId,
      })
      .expect(200)

    // El Administrativo lo ve en el historial, aunque no ve la fila del
    // superadmin (no tiene universidad).
    const historial = await pedir(
      'get',
      `/api/cursos/${cursoId}/historial`,
      await login(ADMIN_INGENIERIA_NORTE),
    ).expect(200)
    expect((historial.body as CambioCurso[])[0].responsable).toEqual({
      id: superadminId,
      nombre: 'Superadmin',
    })
  })

  it('quita un ayudante y el motivo queda en su auditoría', async () => {
    const [{ id: seccionId }] = await bd.query<{ id: string }[]>(
      `SELECT s.id FROM seccion s JOIN curso c ON c.id = s.curso_id
         JOIN carrera ca ON ca.id = c.carrera_id
        WHERE ca.facultad_id = $1 ORDER BY c.codigo, s.numero LIMIT 1`,
      [ingenieriaNorte.facultadId],
    )
    const [{ id: ayudanteId }] = await bd.query<{ id: string }[]>(
      `SELECT id FROM usuario WHERE universidad_id = $1 AND rol = 'AYUDANTE'
        ORDER BY correo LIMIT 1`,
      [ingenieriaNorte.universidadId],
    )
    await pedir('post', `/api/secciones/${seccionId}/ayudantes`, token)
      .send({ ayudanteIds: [ayudanteId] })
      .expect(200)
    const respuesta = await pedir(
      'patch',
      `/api/secciones/${seccionId}/ayudantes/${ayudanteId}/quitar`,
      token,
    )
      .send({ motivo: 'Asignado por error' })
      .expect(200)
    expect(respuesta.body).toMatchObject({
      quitadoPor: { id: superadminId, nombre: 'Superadmin' },
      motivo: 'Asignado por error',
    })

    const cambios = await bd.query<{ operacion: string; motivo: string }[]>(
      `SELECT operacion, motivo FROM superadmin_cambio
        WHERE tabla = 'ayudante_seccion'
          AND nuevo->>'seccion_id' = $1 AND nuevo->>'usuario_id' = $2
        ORDER BY fecha, id`,
      [seccionId, ayudanteId],
    )
    expect(cambios).toEqual([
      { operacion: 'INSERT', motivo: null },
      { operacion: 'UPDATE', motivo: 'Asignado por error' },
    ])
  })

  it('entra al espacio de una sección de su facultad como Administrativo', async () => {
    const seccionDe = async (facultadId: string) => {
      const [{ id }] = await bd.query<{ id: string }[]>(
        `SELECT s.id FROM seccion s JOIN curso c ON c.id = s.curso_id
           JOIN carrera ca ON ca.id = c.carrera_id
          WHERE ca.facultad_id = $1 LIMIT 1`,
        [facultadId],
      )
      return id
    }
    const propia = await pedir(
      'get',
      `/api/espacio/secciones/${await seccionDe(ingenieriaNorte.facultadId)}`,
      token,
    ).expect(200)
    expect(propia.body).toMatchObject({ rol: 'ADMINISTRATIVO' })
    // Otra facultad de la misma universidad: no es integrante.
    await pedir(
      'get',
      `/api/espacio/secciones/${await seccionDe(economiaNorte.facultadId)}`,
      token,
    ).expect(403)
    // Otra universidad: no existe para esta sesión.
    await pedir(
      'get',
      `/api/espacio/secciones/${await seccionDe(saludSur.facultadId)}`,
      token,
    ).expect(404)
  })

  it('cambia de universidad en cualquier momento', async () => {
    await elegir(token, saludSur).expect(200)
    const delAdministrativo = await pedir(
      'get',
      '/api/carreras',
      await login(ADMIN_SUR),
    ).expect(200)
    const delSuperadmin = await pedir('get', '/api/carreras', token).expect(200)
    expect(delSuperadmin.body).toEqual(delAdministrativo.body)
    expect(delSuperadmin.body).not.toContainEqual(
      expect.objectContaining({ nombre: 'Carrera del superadmin' }),
    )
    await elegir(token, ingenieriaNorte).expect(200)
  })

  it('si la facultad elegida se archiva, debe elegir otra', async () => {
    const otra = await loginSuperadmin()
    await elegir(otra, economiaNorte).expect(200)
    await bd.query('UPDATE facultad SET archived_at = now() WHERE id = $1', [
      economiaNorte.facultadId,
    ])
    try {
      await pedir('get', '/api/cursos', otra).expect(403)
      const yo = await pedir('get', '/api/auth/yo', otra).expect(200)
      expect(yo.body).toMatchObject({ universidadId: null })
      // Tampoco la puede volver a elegir.
      await elegir(otra, economiaNorte).expect(404)
    } finally {
      await bd.query('UPDATE facultad SET archived_at = NULL WHERE id = $1', [
        economiaNorte.facultadId,
      ])
    }
  })

  it('edita su propio nombre en el perfil', async () => {
    const respuesta = await pedir('patch', '/api/perfil', token)
      .send({ nombre: 'Superadmin renombrado' })
      .expect(200)
    expect(respuesta.body).toEqual({ nombre: 'Superadmin renombrado' })
  })
})

describe('los demás roles mantienen su aislamiento', () => {
  const otrosRoles = UNIVERSIDADES.flatMap((universidad) =>
    universidad.usuarios.map((usuario) => ({
      correo: `${usuario.usuario}@${universidad.dominio}`,
      rol: usuario.rol,
    })),
  )

  it.each(otrosRoles)(
    '$correo ($rol) no usa el panel del superadmin',
    async ({ correo }) => {
      const token = await login(correo)
      await pedir('get', '/api/superadmin/universidades', token).expect(403)
      await elegir(token, ingenieriaNorte).expect(403)
    },
  )

  it('el Administrativo de otra universidad no ve lo que creó el superadmin', async () => {
    const respuesta = await pedir(
      'get',
      '/api/carreras',
      await login(ADMIN_SUR),
    ).expect(200)
    expect(respuesta.body).not.toContainEqual(
      expect.objectContaining({ nombre: 'Carrera del superadmin' }),
    )
  })

  it('el Administrativo de otra facultad no ve lo que creó el superadmin', async () => {
    const respuesta = await pedir(
      'get',
      '/api/carreras',
      await login(`administrativo.economia@${NORTE}`),
    ).expect(200)
    expect(respuesta.body).not.toContainEqual(
      expect.objectContaining({ nombre: 'Carrera del superadmin' }),
    )
  })
})
