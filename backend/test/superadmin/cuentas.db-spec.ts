import type {
  CuentaCreada,
  CuentaUniversidad,
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
import { configurarApp } from '../../src/config/configurar-app.js'
import { crearSuperadmin } from '../../src/database/crear-superadmin.js'
import { opcionesDataSource } from '../../src/database/data-source.js'
import { ejecutarSeed, UNIVERSIDADES } from '../../src/database/seed.js'

// GES-24: el superadmin crea, edita y archiva cuentas de cualquier rol en
// cualquier universidad. Base propia con el seed y un superadmin.

const BD_TEST = `${process.env.POSTGRES_TEST_DB ?? 'cursus_test'}_cuentas`
const BD_ORIGINAL = process.env.POSTGRES_DB
const PASSWORD = 'contraseña-de-prueba'
const SUPERADMIN = 'superadmin@cursus.test'

const [NORTE, SUR] = UNIVERSIDADES.map((u) => u.dominio)
const ADMIN_NORTE = `administrativo.ingenieria@${NORTE}`
const DIRECTOR_NORTE = `director@${NORTE}`
const NO_EXISTE = '00000000-0000-4000-8000-000000000000'

let admin: DataSource
let bd: DataSource
let app: INestApplication<App>
let token: string
let norte: UniversidadElegible
let sur: UniversidadElegible

function login(correo: string, password = PASSWORD) {
  return request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ correo, password })
}

async function tokenDe(correo: string, password = PASSWORD) {
  const respuesta = await login(correo, password).expect(200)
  return (respuesta.body as RespuestaLogin).accessToken
}

const ruta = (universidadId: string, sufijo = '') =>
  `/api/superadmin/universidades/${universidadId}/cuentas${sufijo}`

const pedir = (
  metodo: 'get' | 'post' | 'put' | 'patch',
  url: string,
  conToken = token,
) =>
  request(app.getHttpServer())
    [metodo](url)
    .set('Authorization', `Bearer ${conToken}`)

const listar = async (universidadId: string) =>
  (await pedir('get', ruta(universidadId)).expect(200))
    .body as CuentaUniversidad[]

const crear = (universidadId: string, datos: Record<string, unknown>) =>
  pedir('post', ruta(universidadId)).send(datos)

let numero = 0
// Datos válidos de un Director nuevo de Norte, distintos en cada llamada.
function nueva(cambios: Record<string, unknown> = {}) {
  numero += 1
  return {
    nombre: `Cuenta Nueva ${numero}`,
    correo: `cuenta${numero}@${NORTE}`,
    rol: 'DIRECTOR',
    ...cambios,
  }
}

async function crearCuenta(cambios: Record<string, unknown> = {}) {
  const respuesta = await crear(norte.id, nueva(cambios)).expect(201)
  return respuesta.body as CuentaCreada
}

// Una cuenta lista para entrar: cambia la contraseña provisoria por PASSWORD.
async function conPasswordPropia({ cuenta, passwordProvisoria }: CuentaCreada) {
  const provisorio = await tokenDe(cuenta.correo, passwordProvisoria)
  await pedir('put', '/api/auth/password', provisorio)
    .send({ passwordActual: passwordProvisoria, passwordNueva: PASSWORD })
    .expect(204)
  return tokenDe(cuenta.correo)
}

const auditoria = (registroId: string) =>
  bd.query<
    {
      operacion: string
      universidad_id: string
      anterior: unknown
      nuevo: unknown
    }[]
  >(
    `SELECT operacion, universidad_id, anterior, nuevo FROM superadmin_cambio
      WHERE tabla = 'usuario' AND registro_id = $1 ORDER BY fecha, id`,
    [registroId],
  )

const facultadDe = (universidad: UniversidadElegible, nombre: string) => {
  const facultad = universidad.facultades.find((f) => f.nombre === nombre)
  if (!facultad) throw new Error(`Falta la facultad ${nombre}`)
  return facultad
}

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
  // La contraseña provisoria del superadmin la cubre MT-04.
  await bd.query(
    `UPDATE usuario SET credencial_provisoria = false WHERE rol = 'SUPERADMIN'`,
  )

  process.env.POSTGRES_DB = BD_TEST
  const modulo = await Test.createTestingModule({
    imports: [AppModule],
  }).compile()
  app = modulo.createNestApplication<INestApplication<App>>({ logger: false })
  configurarApp(app, { secretoOrigen: '' })
  await app.listen(0)

  token = await tokenDe(SUPERADMIN)
  const universidades = (
    await pedir('get', '/api/superadmin/universidades').expect(200)
  ).body as UniversidadElegible[]
  const buscar = (dominio: string) =>
    universidades.find(
      (u) => u.dominioCorreo === dominio,
    ) as UniversidadElegible
  norte = buscar(NORTE)
  sur = buscar(SUR)
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

describe('crear una cuenta', () => {
  it.each(['DIRECTOR', 'PROFESOR', 'AYUDANTE', 'ALUMNO'])(
    'crea un %s sin facultad, que entra con la contraseña provisoria y debe cambiarla',
    async (rol) => {
      const { cuenta, passwordProvisoria } = await crearCuenta({
        nombre: `  Nombre   de ${rol} `,
        rol,
      })
      expect(cuenta).toMatchObject({
        nombre: `Nombre de ${rol}`,
        rol,
        facultad: null,
      })
      expect(passwordProvisoria).toMatch(/^[A-Z2-9]{16}$/)

      const provisorio = await tokenDe(cuenta.correo, passwordProvisoria)
      const yo = (await pedir('get', '/api/auth/yo', provisorio).expect(200))
        .body as UsuarioSesion
      expect(yo).toMatchObject({
        rol,
        universidadId: norte.id,
        debeCambiarPassword: true,
      })
    },
  )

  it('crea un Administrativo en la facultad elegida, en otra universidad', async () => {
    const facultad = sur.facultades[0]
    const correo = `nuevo.administrativo@${SUR}`
    const body: unknown = (
      await crear(sur.id, {
        nombre: 'Administrativo Nuevo',
        correo: ` ${correo.toUpperCase()} `,
        rol: 'ADMINISTRATIVO',
        facultadId: facultad.id,
      }).expect(201)
    ).body
    const { cuenta, passwordProvisoria } = body as CuentaCreada
    expect(cuenta).toMatchObject({ correo, rol: 'ADMINISTRATIVO', facultad })

    const provisorio = await tokenDe(correo, passwordProvisoria)
    const yo = (await pedir('get', '/api/auth/yo', provisorio).expect(200))
      .body as UsuarioSesion
    expect(yo.facultadNombre).toBe(facultad.nombre)
  })

  it('la contraseña se guarda solo como hash y el cambio queda auditado sin él', async () => {
    const { cuenta, passwordProvisoria } = await crearCuenta()
    const [{ password_hash: guardada }] = await bd.query<
      { password_hash: string }[]
    >('SELECT password_hash FROM usuario WHERE id = $1', [cuenta.id])
    expect(guardada).toMatch(/^\$argon2/)
    expect(guardada).not.toContain(passwordProvisoria)

    const [cambio] = await auditoria(cuenta.id)
    expect(cambio).toMatchObject({
      operacion: 'INSERT',
      universidad_id: norte.id,
    })
    expect(JSON.stringify(cambio)).not.toContain('password_hash')
    expect(JSON.stringify(cambio)).not.toContain(guardada)
  })

  it('rechaza un correo de otro dominio con un mensaje claro', async () => {
    const correo = `alguien@${SUR}`
    const body: unknown = (await crear(norte.id, nueva({ correo })).expect(400))
      .body
    expect((body as { message: string }).message).toBe(
      `El correo debe ser @${NORTE}`,
    )
    expect(
      await bd.query('SELECT id FROM usuario WHERE lower(correo) = $1', [
        correo,
      ]),
    ).toEqual([])
  })

  it('un correo ya registrado no crea una cuenta nueva, con otras mayúsculas', async () => {
    const antes = (await listar(norte.id)).length
    const body: unknown = (
      await crear(
        norte.id,
        nueva({ correo: ADMIN_NORTE.toUpperCase() }),
      ).expect(409)
    ).body
    expect((body as { message: string }).message).toContain(
      'Ya existe una cuenta con ese correo',
    )
    expect(await listar(norte.id)).toHaveLength(antes)
  })

  it('el correo de una cuenta archivada sigue ocupado', async () => {
    const { cuenta } = await crearCuenta()
    await pedir('patch', ruta(norte.id, `/${cuenta.id}/archivar`)).expect(204)
    await crear(norte.id, nueva({ correo: cuenta.correo })).expect(409)
  })

  it('el Administrativo debe elegir una facultad vigente de esa universidad', async () => {
    const administrativo = { rol: 'ADMINISTRATIVO' }
    await crear(norte.id, nueva(administrativo)).expect(400)
    await crear(
      norte.id,
      nueva({ ...administrativo, facultadId: sur.facultades[0].id }),
    ).expect(400)

    const [{ id: archivada }] = await bd.query<{ id: string }[]>(
      `INSERT INTO facultad (universidad_id, nombre, archived_at)
       VALUES ($1, 'Facultad Archivada', now()) RETURNING id`,
      [norte.id],
    )
    await crear(
      norte.id,
      nueva({ ...administrativo, facultadId: archivada }),
    ).expect(400)
  })

  it('otro rol no elige facultad', async () => {
    const body: unknown = (
      await crear(
        norte.id,
        nueva({ rol: 'PROFESOR', facultadId: norte.facultades[0].id }),
      ).expect(400)
    ).body
    expect((body as { message: string }).message).toBe(
      'Solo un Administrativo elige facultad',
    )
  })

  it('no crea otro superadmin', async () => {
    await crear(norte.id, nueva({ rol: 'SUPERADMIN' })).expect(400)
  })

  it.each([
    ['sin nombre', { nombre: '   ' }],
    ['con un NUL en el nombre', { nombre: 'Nombre\u0000' }],
    ['con un correo inválido', { correo: 'no-es-correo' }],
    ['con un campo extra', { universidadId: NO_EXISTE }],
  ])('responde 400 %s', async (_caso, cambios) => {
    await crear(norte.id, nueva(cambios)).expect(400)
  })

  it('responde 404 con una universidad inexistente o archivada', async () => {
    await crear(NO_EXISTE, nueva()).expect(404)

    const body: unknown = (
      await pedir('post', '/api/superadmin/universidades')
        .send({
          nombre: 'Universidad Por Archivar',
          dominioCorreo: 'porarchivar.cl',
          color: '#aa3300',
        })
        .expect(201)
    ).body
    const { id } = body as UniversidadElegible
    await pedir('patch', `/api/superadmin/universidades/${id}/archivar`)
      .send({ motivo: 'Prueba' })
      .expect(204)
    await crear(id, nueva({ correo: 'alguien@porarchivar.cl' })).expect(404)
    await pedir('get', ruta(id)).expect(404)
  })
})

describe('listar las cuentas', () => {
  it('muestra las cuentas vigentes de esa universidad, con su facultad', async () => {
    const cuentas = await listar(norte.id)
    const correos = cuentas.map((c) => c.correo)

    expect(correos).toContain(ADMIN_NORTE)
    expect(correos.every((c) => c.endsWith(`@${NORTE}`))).toBe(true)
    expect(correos).not.toContain(SUPERADMIN)
    expect(cuentas.find((c) => c.correo === ADMIN_NORTE)?.facultad).toEqual(
      facultadDe(norte, 'Facultad de Ingeniería'),
    )
    expect(
      cuentas.find((c) => c.correo === DIRECTOR_NORTE)?.facultad,
    ).toBeNull()
  })
})

describe('editar una cuenta', () => {
  it('cambia el nombre y el correo, y entra con el correo nuevo', async () => {
    const creada = await crearCuenta()
    await conPasswordPropia(creada)
    const correo = `editado${creada.cuenta.id.slice(0, 8)}@${NORTE}`

    const body: unknown = (
      await pedir('patch', ruta(norte.id, `/${creada.cuenta.id}`))
        .send({ nombre: 'Nombre Editado', correo, rol: 'DIRECTOR' })
        .expect(200)
    ).body
    expect(body).toMatchObject({ nombre: 'Nombre Editado', correo })

    await login(creada.cuenta.correo).expect(401)
    await login(correo).expect(200)
    const cambios = await auditoria(creada.cuenta.id)
    expect(
      cambios.find((cambio) => cambio.operacion === 'UPDATE'),
    ).toMatchObject({
      anterior: { correo: creada.cuenta.correo },
      nuevo: { nombre: 'Nombre Editado', correo },
    })
  })

  it('rechaza otro dominio y un correo de otra cuenta, y acepta el propio', async () => {
    const { cuenta } = await crearCuenta()
    const url = ruta(norte.id, `/${cuenta.id}`)
    const base = { nombre: cuenta.nombre, rol: 'DIRECTOR' }

    await pedir('patch', url)
      .send({ ...base, correo: `alguien@${SUR}` })
      .expect(400)
    await pedir('patch', url)
      .send({ ...base, correo: ADMIN_NORTE })
      .expect(409)
    await pedir('patch', url)
      .send({ ...base, correo: cuenta.correo })
      .expect(200)
  })

  it('al pasar a Administrativo pide facultad; otro rol conserva la suya y el Director la pierde', async () => {
    const { cuenta } = await crearCuenta()
    const url = ruta(norte.id, `/${cuenta.id}`)
    const base = { nombre: cuenta.nombre, correo: cuenta.correo }
    const facultad = norte.facultades[0]

    await pedir('patch', url)
      .send({ ...base, rol: 'ADMINISTRATIVO' })
      .expect(400)
    const administrativo = await pedir('patch', url)
      .send({ ...base, rol: 'ADMINISTRATIVO', facultadId: facultad.id })
      .expect(200)
    expect(administrativo.body).toMatchObject({ facultad })

    const profesor = await pedir('patch', url)
      .send({ ...base, rol: 'PROFESOR' })
      .expect(200)
    expect(profesor.body).toMatchObject({ rol: 'PROFESOR', facultad })

    const director = await pedir('patch', url)
      .send({ ...base, rol: 'DIRECTOR' })
      .expect(200)
    expect(director.body).toMatchObject({ rol: 'DIRECTOR', facultad: null })
  })

  it('cambiar el rol sin asignaciones cierra sus sesiones', async () => {
    const creada = await crearCuenta({ rol: 'ALUMNO' })
    const sesion = await conPasswordPropia(creada)
    const { cuenta } = creada
    await pedir('get', '/api/auth/yo', sesion).expect(200)

    await pedir('patch', ruta(norte.id, `/${cuenta.id}`))
      .send({ nombre: cuenta.nombre, correo: cuenta.correo, rol: 'PROFESOR' })
      .expect(200)

    await pedir('get', '/api/auth/yo', sesion).expect(401)
    const nueva = await tokenDe(cuenta.correo)
    const yo = (await pedir('get', '/api/auth/yo', nueva).expect(200))
      .body as UsuarioSesion
    expect(yo.rol).toBe('PROFESOR')
  })

  it('editar sin cambiar el rol no cierra sus sesiones', async () => {
    const creada = await crearCuenta()
    const sesion = await conPasswordPropia(creada)
    const { cuenta } = creada

    await pedir('patch', ruta(norte.id, `/${cuenta.id}`))
      .send({ nombre: 'Otro Nombre', correo: cuenta.correo, rol: 'DIRECTOR' })
      .expect(200)

    await pedir('get', '/api/auth/yo', sesion).expect(200)
  })

  describe('con asignaciones activas no cambia el rol', () => {
    const seccion = async () =>
      (
        await bd.query<{ id: string }[]>(
          `SELECT id FROM seccion WHERE universidad_id = $1 LIMIT 1`,
          [norte.id],
        )
      )[0].id

    it.each([
      [
        'a cargo de una sección',
        'PROFESOR',
        'UPDATE seccion SET profesor_id = $2 WHERE id = $1',
        '1 secciones a cargo',
      ],
      [
        'con una ayudantía',
        'AYUDANTE',
        `INSERT INTO ayudante_seccion (universidad_id, seccion_id, usuario_id)
         SELECT universidad_id, id, $2 FROM seccion WHERE id = $1`,
        '1 ayudantías',
      ],
      [
        'con una inscripción',
        'ALUMNO',
        `INSERT INTO inscripcion (universidad_id, seccion_id, usuario_id)
         SELECT universidad_id, id, $2 FROM seccion WHERE id = $1`,
        '1 inscripciones',
      ],
    ])('%s', async (_caso, rol, asignar, mensaje) => {
      const { cuenta } = await crearCuenta({ rol })
      await bd.query(asignar, [await seccion(), cuenta.id])
      const url = ruta(norte.id, `/${cuenta.id}`)
      const base = { nombre: 'Otro', correo: cuenta.correo }

      const body: unknown = (
        await pedir('patch', url)
          .send({ ...base, rol: 'DIRECTOR' })
          .expect(409)
      ).body
      expect((body as { message: string }).message).toContain(mensaje)
      const [{ rol: guardado, nombre }] = await bd.query<
        { rol: string; nombre: string }[]
      >('SELECT rol, nombre FROM usuario WHERE id = $1', [cuenta.id])
      expect(guardado).toBe(rol)
      expect(nombre).toBe(cuenta.nombre)

      // Sus otros datos sí se editan.
      await pedir('patch', url)
        .send({ ...base, rol })
        .expect(200)
    })
  })

  it('responde 404 con una cuenta de otra universidad, inexistente o archivada', async () => {
    const datos = {
      nombre: 'Intruso',
      correo: `intruso@${NORTE}`,
      rol: 'ALUMNO',
    }
    const [{ id: deSur }] = await bd.query<{ id: string }[]>(
      'SELECT id FROM usuario WHERE correo = $1',
      [`director@${SUR}`],
    )
    await pedir('patch', ruta(norte.id, `/${deSur}`))
      .send(datos)
      .expect(404)
    await pedir('patch', ruta(norte.id, `/${NO_EXISTE}`))
      .send(datos)
      .expect(404)

    const { cuenta } = await crearCuenta()
    await pedir('patch', ruta(norte.id, `/${cuenta.id}/archivar`)).expect(204)
    await pedir('patch', ruta(norte.id, `/${cuenta.id}`))
      .send(datos)
      .expect(404)
  })

  it('el id del superadmin no se puede editar ni archivar', async () => {
    const [{ id }] = await bd.query<{ id: string }[]>(
      'SELECT id FROM usuario WHERE correo = $1',
      [SUPERADMIN],
    )
    await pedir('patch', ruta(norte.id, `/${id}`))
      .send({ nombre: 'X', correo: `x@${NORTE}`, rol: 'ALUMNO' })
      .expect(404)
    await pedir('patch', ruta(norte.id, `/${id}/archivar`)).expect(404)
  })
})

describe('egreso de un alumno (HIS-06)', () => {
  it('conserva el acceso al historial tras más de diez años y restringe los tokens anteriores', async () => {
    const creada = await crearCuenta({ rol: 'ALUMNO' })
    const { cuenta } = creada
    const anterior = await conPasswordPropia(creada)
    const administrativo = await tokenDe(ADMIN_NORTE)
    const [{ curso, seccion }] = await bd.query<
      { curso: string; seccion: string }[]
    >(
      `
      WITH periodo_antiguo AS (
        INSERT INTO periodo (universidad_id, anio, semestre, fecha_inicio, fecha_termino)
        VALUES ($1, 2013, 2, '2013-08-01', '2013-12-31') RETURNING id
      ), curso_antiguo AS (
        INSERT INTO curso (universidad_id, carrera_id, periodo_id, codigo, nombre)
        SELECT $1, c.carrera_id, p.id, 'HIS06', 'Curso de egreso'
          FROM curso c CROSS JOIN periodo_antiguo p WHERE c.codigo = 'ICC101'
        RETURNING id
      ), seccion_antigua AS (
        INSERT INTO seccion (universidad_id, curso_id, numero)
        SELECT $1, id, 1 FROM curso_antiguo RETURNING id, curso_id
      ), evaluacion_antigua AS (
        INSERT INTO evaluacion (universidad_id, seccion_id, nombre, fecha, ponderacion, creada_por)
        SELECT $1, s.id, 'Examen', '2013-11-01', 100, u.id
          FROM seccion_antigua s CROSS JOIN usuario u WHERE u.correo = $3
        RETURNING id
      ), nota_antigua AS (
        INSERT INTO nota (universidad_id, evaluacion_id, alumno_id, valor, estado, propuesta_por)
        SELECT $1, e.id, $2, 6, 'PUBLICADA', u.id
          FROM evaluacion_antigua e CROSS JOIN usuario u WHERE u.correo = $4
      )
      SELECT curso_id AS curso, id AS seccion FROM seccion_antigua
    `,
      [norte.id, cuenta.id, `profesor@${NORTE}`, `ayudante@${NORTE}`],
    )
    await pedir('post', `/api/cursos/${curso}/cierre`, administrativo).expect(
      200,
    )
    const egresar = ruta(norte.id, `/${cuenta.id}/egresar`)
    await pedir('patch', ruta(sur.id, `/${cuenta.id}/egresar`)).expect(404)
    await pedir('patch', egresar, administrativo).expect(403)
    const noAlumno = (await listar(norte.id)).find((u) => u.rol === 'PROFESOR')
    await pedir('patch', ruta(norte.id, `/${noAlumno?.id}/egresar`)).expect(409)
    await pedir('get', '/api/dashboard/secciones-alumno', anterior).expect(200)
    await pedir('patch', egresar).expect(204)
    await pedir('patch', egresar).expect(204)
    expect(
      (await listar(norte.id)).find((u) => u.id === cuenta.id),
    ).toMatchObject({ egresado: true })
    expect(
      (await auditoria(cuenta.id)).map(({ operacion }) => operacion).sort(),
    ).toEqual(['INSERT', 'UPDATE'])
    await pedir('patch', ruta(norte.id, `/${cuenta.id}/archivar`)).expect(409)

    for (const url of [
      '/api/dashboard/secciones-alumno',
      `/api/espacio/secciones/${seccion}/mis-notas`,
    ]) {
      await pedir('get', url, anterior).expect(403)
    }
    await pedir('patch', '/api/perfil', anterior)
      .send({ nombre: 'Nombre cambiado' })
      .expect(403)
    const yo = (await pedir('get', '/api/auth/yo', anterior).expect(200))
      .body as UsuarioSesion
    expect(yo.egresado).toBe(true)
    await bd.query(
      `UPDATE usuario SET egresado_en = now() - interval '11 years' WHERE id = $1`,
      [cuenta.id],
    )
    const nuevo = await tokenDe(cuenta.correo)
    const lista = await pedir('get', '/api/mis-cursos/historial', nuevo).expect(
      200,
    )
    expect(lista.body).toMatchObject([
      {
        periodo: { anio: 2013 },
        cursos: [{ seccionId: seccion, notaFinal: { tipo: 'FINAL', nota: 6 } }],
      },
    ])
    const detalle = await pedir(
      'get',
      `/api/mis-cursos/historial/${seccion}`,
      nuevo,
    ).expect(200)
    expect(detalle.body).toMatchObject({
      evaluaciones: [{ nombre: 'Examen', nota: 6 }],
    })
    await pedir('patch', `/api/mis-cursos/historial/${seccion}`, nuevo).expect(
      404,
    )
  })
})

describe('archivar una cuenta', () => {
  it('no puede iniciar sesión, corta su sesión y deja de aparecer', async () => {
    const creada = await crearCuenta()
    const sesion = await conPasswordPropia(creada)
    const { cuenta } = creada
    await pedir('get', '/api/auth/yo', sesion).expect(200)

    await pedir('patch', ruta(norte.id, `/${cuenta.id}/archivar`)).expect(204)

    await pedir('get', '/api/auth/yo', sesion).expect(401)
    await login(cuenta.correo).expect(401)
    expect((await listar(norte.id)).map((c) => c.id)).not.toContain(cuenta.id)
    expect((await auditoria(cuenta.id)).at(-1)?.operacion).toBe('UPDATE')
  })

  it('se permite con asignaciones activas', async () => {
    const { cuenta } = await crearCuenta({ rol: 'PROFESOR' })
    await bd.query(
      `UPDATE seccion SET profesor_id = $1
        WHERE id = (SELECT id FROM seccion WHERE universidad_id = $2 LIMIT 1)`,
      [cuenta.id, norte.id],
    )
    await pedir('patch', ruta(norte.id, `/${cuenta.id}/archivar`)).expect(204)
  })

  it('responde 404 si ya está archivada o es de otra universidad', async () => {
    const { cuenta } = await crearCuenta()
    await pedir('patch', ruta(sur.id, `/${cuenta.id}/archivar`)).expect(404)
    await pedir('patch', ruta(norte.id, `/${cuenta.id}/archivar`)).expect(204)
    await pedir('patch', ruta(norte.id, `/${cuenta.id}/archivar`)).expect(404)
  })
})

describe('solo el superadmin', () => {
  it.each([
    ['el Administrativo', ADMIN_NORTE],
    ['el Director', DIRECTOR_NORTE],
    ['un profesor', `profesor@${NORTE}`],
    ['un alumno', `alumno@${NORTE}`],
  ])('%s recibe 403 en todas las rutas', async (_caso, correo) => {
    const propio = await tokenDe(correo)
    const antes = (await listar(norte.id)).length
    const [{ id }] = await bd.query<{ id: string }[]>(
      'SELECT id FROM usuario WHERE correo = $1',
      [`ayudante@${NORTE}`],
    )

    await pedir('get', ruta(norte.id), propio).expect(403)
    await pedir('post', ruta(norte.id), propio).send(nueva()).expect(403)
    await pedir('patch', ruta(norte.id, `/${id}`), propio)
      .send(nueva())
      .expect(403)
    await pedir('patch', ruta(norte.id, `/${id}/archivar`), propio).expect(403)
    expect(await listar(norte.id)).toHaveLength(antes)
  })

  it('funciona sin que haya elegido una facultad', async () => {
    const yo = (await pedir('get', '/api/auth/yo').expect(200))
      .body as UsuarioSesion
    expect(yo.universidadId).toBeNull()
    await listar(sur.id)
  })
})
