import type {
  ArchivoResumen,
  DescargaArchivo,
  SubidaArchivo,
} from '@cursus/shared'
import {
  type INestApplication,
  ServiceUnavailableException,
} from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { DataSource, type QueryRunner } from 'typeorm'
import { AppModule } from '../../src/app.module.js'
import {
  AlmacenamientoService,
  type ObjetoSubido,
} from '../../src/archivos/almacenamiento.service.js'
import type { RespuestaLogin } from '../../src/auth/auth.controller.js'
import { configurarApp } from '../../src/config/configurar-app.js'
import { opcionesDataSource } from '../../src/database/data-source.js'
import { ejecutarSeed } from '../../src/database/seed.js'

// MAT-01: base propia con el seed cargado, que se crea y se borra en cada
// ejecución. Todos los usuarios del seed comparten la contraseña.
const BD_TEST = `${process.env.POSTGRES_TEST_DB ?? 'cursus_test'}_archivos`
const PASSWORD = 'contraseña-de-prueba'
const BD_ORIGINAL = process.env.POSTGRES_DB
const SIN_PERMISO = '42501'

const PROFESOR = 'profesor@norte.cursus.test'
const AYUDANTE = 'ayudante@norte.cursus.test'
const ALUMNO = 'alumno@norte.cursus.test'
const ADMIN_INGENIERIA = 'administrativo.ingenieria@norte.cursus.test'
const DIRECTOR = 'director@norte.cursus.test'

// S3 en memoria: firma sin red y guarda lo que "subió" el navegador. El
// formato real de las firmas lo prueba almacenamiento.service.spec.ts.
class AlmacenamientoFalso {
  disponible = true
  readonly firmadas: { clave: string; tipo: string; tamano: number }[] = []
  readonly objetos = new Map<string, ObjetoSubido>()

  private conectado() {
    if (!this.disponible) {
      throw new ServiceUnavailableException(
        'El almacenamiento de archivos no está disponible',
      )
    }
  }

  firmarSubida(clave: string, tipo: string, tamano: number) {
    this.conectado()
    this.firmadas.push({ clave, tipo, tamano })
    return Promise.resolve({
      url: 'https://s3.test/',
      campos: { key: clave, 'Content-Type': tipo },
      expiraEn: new Date(Date.now() + 600_000),
    })
  }

  firmarDescarga(clave: string, nombre: string) {
    this.conectado()
    return Promise.resolve({
      url: `https://s3.test/${clave}?nombre=${encodeURIComponent(nombre)}`,
      expiraEn: new Date(Date.now() + 300_000),
    })
  }

  objetoSubido(clave: string) {
    this.conectado()
    return Promise.resolve(this.objetos.get(clave) ?? null)
  }
}

const almacenamiento = new AlmacenamientoFalso()

let admin: DataSource
let bd: DataSource
let app: INestApplication<App>
const tokens = new Map<string, string>()

// Usuarios de demo de Ingeniería Norte, distintos de los base.
const demo = { profesor2: '', alumno2: '', alumnoFuera: '' }
// ICC101 secciones 1 y 2 (mismo curso, profesores distintos).
const secciones = { s1: '', s2: '' }

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
async function pedirSubida(
  correo: string,
  seccionId: string,
  body: object,
  estado = 201,
) {
  const token = await tokenDe(correo)
  const respuesta = await request(app.getHttpServer())
    .post(`/api/espacio/secciones/${seccionId}/archivos`)
    .set('Authorization', `Bearer ${token}`)
    .send(body)
    .expect(estado)
  return respuesta.body as SubidaArchivo & { message: string | string[] }
}

async function confirmar(
  correo: string,
  seccionId: string,
  archivoId: string,
  estado = 200,
) {
  const token = await tokenDe(correo)
  const respuesta = await request(app.getHttpServer())
    .post(`/api/espacio/secciones/${seccionId}/archivos/${archivoId}/confirmar`)
    .set('Authorization', `Bearer ${token}`)
    .expect(estado)
  return respuesta.body as ArchivoResumen & { message: string }
}

async function descargar(
  correo: string,
  seccionId: string,
  archivoId: string,
  estado = 200,
) {
  const token = await tokenDe(correo)
  const respuesta = await request(app.getHttpServer())
    .get(`/api/espacio/secciones/${seccionId}/archivos/${archivoId}/descarga`)
    .set('Authorization', `Bearer ${token}`)
    .expect(estado)
  return respuesta.body as DescargaArchivo
}

// Pide la subida, "sube" el objeto tal como lo exige la firma y la confirma.
async function subir(correo: string, seccionId: string, nombre = 'guia.pdf') {
  const { archivo } = await pedirSubida(correo, seccionId, {
    nombre,
    tamano: 100,
  })
  almacenamiento.objetos.set(await claveDe(archivo.id), {
    tamano: archivo.tamano,
    tipo: archivo.tipo,
  })
  return confirmar(correo, seccionId, archivo.id)
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

const claveDe = async (archivoId: string) =>
  (
    await bd.query<{ clave: string }[]>(
      'SELECT clave FROM archivo WHERE id = $1',
      [archivoId],
    )
  )[0].clave

const archivosEnBase = async () =>
  Number(
    (
      await bd.query<{ cantidad: string }[]>(
        'SELECT count(*) AS cantidad FROM archivo',
      )
    )[0].cantidad,
  )

// Correo del n-ésimo usuario de demo de Ingeniería Norte con ese rol.
async function demoDe(rol: string, n: number) {
  const filas = await bd.query<{ correo: string }[]>(
    `SELECT u.correo FROM usuario u
       JOIN facultad f ON f.id = u.facultad_id
       JOIN universidad un ON un.id = u.universidad_id
      WHERE u.rol = $1 AND f.nombre = 'Facultad de Ingeniería'
        AND un.dominio_correo = 'norte.cursus.test'
        AND u.correo NOT IN ($2, $3, $4)
      ORDER BY u.correo`,
    [rol, PROFESOR, AYUDANTE, ALUMNO],
  )
  return filas[n].correo
}

// Escenario, armado como dueño de las tablas (sin RLS), con el mismo criterio
// que anuncios.db-spec.ts: en ICC101-1 están el profesor, el ayudante y dos
// alumnos (ALUMNO y alumno2); alumnoFuera no está inscrito en ICC101.
async function armarEscenario() {
  secciones.s1 = await seccionDe('ICC101', 1)
  secciones.s2 = await seccionDe('ICC101', 2)
  demo.profesor2 = await demoDe('PROFESOR', 0)
  demo.alumno2 = await demoDe('ALUMNO', 0)
  demo.alumnoFuera = await demoDe('ALUMNO', 1)

  const aCargo = async (seccionId: string, correo: string) =>
    bd.query<unknown>('UPDATE seccion SET profesor_id = $2 WHERE id = $1', [
      seccionId,
      await idDe(correo),
    ])
  await aCargo(secciones.s1, PROFESOR)
  await aCargo(secciones.s2, demo.profesor2)

  await bd.query(
    `INSERT INTO ayudante_seccion (universidad_id, seccion_id, usuario_id)
     SELECT s.universidad_id, s.id, $2 FROM seccion s
      WHERE s.id = $1 AND NOT EXISTS (
        SELECT 1 FROM ayudante_seccion a
         WHERE a.seccion_id = s.id AND a.usuario_id = $2 AND a.archived_at IS NULL)`,
    [secciones.s1, await idDe(AYUDANTE)],
  )

  const alumnos = [ALUMNO, demo.alumno2, demo.alumnoFuera]
  await bd.query(
    `UPDATE inscripcion i SET archived_at = now(), archivada_por = $2
      FROM seccion s, curso c, usuario u
     WHERE s.id = i.seccion_id AND c.id = s.curso_id AND c.codigo = 'ICC101'
       AND u.id = i.usuario_id AND u.correo = ANY($1) AND i.archived_at IS NULL`,
    [alumnos, await idDe(ADMIN_INGENIERIA)],
  )
  for (const correo of [ALUMNO, demo.alumno2]) {
    await bd.query(
      `INSERT INTO inscripcion (universidad_id, seccion_id, usuario_id)
       SELECT universidad_id, $1, $2 FROM seccion WHERE id = $1`,
      [secciones.s1, await idDe(correo)],
    )
  }
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
  })
    .overrideProvider(AlmacenamientoService)
    .useValue(almacenamiento)
    .compile()
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

beforeEach(() => {
  almacenamiento.disponible = true
})

describe('MAT-01: pedir la subida de un archivo', () => {
  it.each([
    ['el profesor', PROFESOR, 'PROFESOR'],
    ['el ayudante', AYUDANTE, 'AYUDANTE'],
    ['un alumno inscrito', ALUMNO, 'ALUMNO'],
  ])(
    '%s recibe una subida firmada para ese tamaño y tipo',
    async (_quien, correo, rol) => {
      const universidad = (
        await bd.query<{ universidad_id: string }[]>(
          'SELECT universidad_id FROM seccion WHERE id = $1',
          [secciones.s1],
        )
      )[0].universidad_id

      const { archivo, subida } = await pedirSubida(correo, secciones.s1, {
        nombre: '  Guía 1.PDF  ',
        tamano: 2048,
      })

      expect(archivo).toEqual({
        id: expect.any(String) as string,
        nombre: 'Guía 1.PDF',
        tipo: 'application/pdf',
        tamano: 2048,
        subidoEn: null,
      })
      // La llave no usa el nombre del usuario.
      const clave = `${universidad}/${secciones.s1}/${archivo.id}`
      expect(subida.campos.key).toBe(clave)
      expect(almacenamiento.firmadas.at(-1)).toEqual({
        clave,
        tipo: 'application/pdf',
        tamano: 2048,
      })
      const [fila] = await bd.query<
        { subido_por: string; subido_como: string; subido_at: Date | null }[]
      >(
        'SELECT subido_por, subido_como, subido_at FROM archivo WHERE id = $1',
        [archivo.id],
      )
      expect(fila).toEqual({
        subido_por: await idDe(correo),
        subido_como: rol,
        subido_at: null,
      })
    },
  )

  it.each([
    ['cuaderno.ipynb', 'application/x-ipynb+json'],
    ['notas.txt', 'text/plain'],
    ['codigo.zip', 'application/zip'],
    ['foto.JPG', 'image/jpeg'],
    [
      'informe.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
  ])('deduce el tipo de %s por su extensión', async (nombre, tipo) => {
    const { archivo } = await pedirSubida(ALUMNO, secciones.s1, {
      nombre,
      tamano: 1,
    })
    expect(archivo.tipo).toBe(tipo)
  })

  it('acepta un archivo de 20 MB exactos', async () => {
    const { archivo } = await pedirSubida(PROFESOR, secciones.s1, {
      nombre: 'grande.pdf',
      tamano: 20 * 1024 * 1024,
    })
    expect(archivo.tamano).toBe(20 * 1024 * 1024)
  })

  it.each([
    ['un tipo no permitido', { nombre: 'programa.exe', tamano: 10 }],
    ['un nombre sin extensión', { nombre: 'informe', tamano: 10 }],
    ['solo la extensión', { nombre: '.pdf', tamano: 10 }],
    ['un nombre vacío', { nombre: '   ', tamano: 10 }],
    ['un nombre con /', { nombre: '../otra/guia.pdf', tamano: 10 }],
    [
      'un nombre con un carácter de control',
      { nombre: 'gu\u0000ia.pdf', tamano: 10 },
    ],
    ['un nombre muy largo', { nombre: `${'x'.repeat(252)}.pdf`, tamano: 10 }],
    ['un archivo vacío', { nombre: 'guia.pdf', tamano: 0 }],
    ['más de 20 MB', { nombre: 'guia.pdf', tamano: 20 * 1024 * 1024 + 1 }],
    ['un tamaño con decimales', { nombre: 'guia.pdf', tamano: 1.5 }],
    ['un tamaño como texto', { nombre: 'guia.pdf', tamano: '10' }],
    ['sin tamaño', { nombre: 'guia.pdf' }],
    ['un campo extra', { nombre: 'guia.pdf', tamano: 10, clave: 'otra/llave' }],
  ])('responde 400 con %s, sin registrar ni firmar', async (_caso, body) => {
    const antes = await archivosEnBase()
    const firmadas = almacenamiento.firmadas.length

    await pedirSubida(PROFESOR, secciones.s1, body, 400)

    expect(await archivosEnBase()).toBe(antes)
    expect(almacenamiento.firmadas).toHaveLength(firmadas)
  })

  it.each([
    ['un alumno no inscrito', () => demo.alumnoFuera],
    ['el profesor de otra sección', () => demo.profesor2],
  ])('%s recibe 403', async (_quien, correo) => {
    const antes = await archivosEnBase()
    await pedirSubida(correo(), secciones.s1, BODY, 403)
    expect(await archivosEnBase()).toBe(antes)
  })

  it('el Administrativo de la facultad recibe 403 aunque entre al espacio', async () => {
    await pedirSubida(ADMIN_INGENIERIA, secciones.s1, BODY, 403)
  })

  it('si el almacenamiento no está disponible responde 503 y no registra nada', async () => {
    almacenamiento.disponible = false
    const antes = await archivosEnBase()

    await pedirSubida(PROFESOR, secciones.s1, BODY, 503)

    expect(await archivosEnBase()).toBe(antes)
  })
})

const BODY = { nombre: 'guia.pdf', tamano: 100 }

describe('MAT-01: confirmar la subida', () => {
  it('responde 409 si el archivo todavía no llega a S3', async () => {
    const { archivo } = await pedirSubida(PROFESOR, secciones.s1, BODY)

    const respuesta = await confirmar(PROFESOR, secciones.s1, archivo.id, 409)

    expect(respuesta.message).toBe('El archivo todavía no se ha subido')
  })

  it('confirma cuando el objeto llegó, y confirmar de nuevo no lo cambia', async () => {
    const { archivo } = await pedirSubida(AYUDANTE, secciones.s1, BODY)
    almacenamiento.objetos.set(await claveDe(archivo.id), {
      tamano: 100,
      tipo: 'application/pdf',
    })

    const confirmado = await confirmar(AYUDANTE, secciones.s1, archivo.id)
    expect(confirmado).toEqual({
      ...archivo,
      subidoEn: expect.any(String) as string,
    })
    expect(new Date(confirmado.subidoEn as string).getTime()).not.toBeNaN()

    const otraVez = await confirmar(AYUDANTE, secciones.s1, archivo.id)
    expect(otraVez.subidoEn).toBe(confirmado.subidoEn)
  })

  it('responde 409 si el objeto no tiene el tamaño o el tipo registrados', async () => {
    const { archivo } = await pedirSubida(PROFESOR, secciones.s1, BODY)
    const clave = await claveDe(archivo.id)

    almacenamiento.objetos.set(clave, { tamano: 99, tipo: 'application/pdf' })
    await confirmar(PROFESOR, secciones.s1, archivo.id, 409)
    almacenamiento.objetos.set(clave, { tamano: 100, tipo: 'text/html' })
    await confirmar(PROFESOR, secciones.s1, archivo.id, 409)

    const [{ subido_at }] = await bd.query<{ subido_at: Date | null }[]>(
      'SELECT subido_at FROM archivo WHERE id = $1',
      [archivo.id],
    )
    expect(subido_at).toBeNull()
  })

  it('solo quien lo subió lo confirma: para otro integrante responde 404', async () => {
    const { archivo } = await pedirSubida(ALUMNO, secciones.s1, BODY)
    almacenamiento.objetos.set(await claveDe(archivo.id), {
      tamano: 100,
      tipo: 'application/pdf',
    })

    await confirmar(PROFESOR, secciones.s1, archivo.id, 404)
    await confirmar(demo.alumno2, secciones.s1, archivo.id, 404)
  })

  it('responde 403 si quien lo subió ya no pertenece a la sección', async () => {
    const { archivo } = await pedirSubida(demo.alumno2, secciones.s1, BODY)
    almacenamiento.objetos.set(await claveDe(archivo.id), {
      tamano: 100,
      tipo: 'application/pdf',
    })
    const alumno = await idDe(demo.alumno2)
    await bd.query(
      `UPDATE inscripcion SET archived_at = now(), archivada_por = $3
        WHERE seccion_id = $1 AND usuario_id = $2 AND archived_at IS NULL`,
      [secciones.s1, alumno, await idDe(ADMIN_INGENIERIA)],
    )
    try {
      // El guard ya lo rechaza; el servicio lo vuelve a revisar por si
      // cambió entre el guard y la confirmación (ver SIGUE_INTEGRANTE).
      await confirmar(demo.alumno2, secciones.s1, archivo.id, 403)
    } finally {
      await bd.query(
        `INSERT INTO inscripcion (universidad_id, seccion_id, usuario_id)
         SELECT universidad_id, $1, $2 FROM seccion WHERE id = $1`,
        [secciones.s1, alumno],
      )
    }
    const [{ subido_at }] = await bd.query<{ subido_at: Date | null }[]>(
      'SELECT subido_at FROM archivo WHERE id = $1',
      [archivo.id],
    )
    expect(subido_at).toBeNull()
  })

  it('responde 404 si el archivo es de otra sección', async () => {
    const { archivo } = await pedirSubida(PROFESOR, secciones.s1, BODY)
    // El profesor de la sección 2 confirma desde la suya un id de la 1.
    await confirmar(demo.profesor2, secciones.s2, archivo.id, 404)
  })
})

describe('MAT-01: descargar un archivo', () => {
  let delProfesor: ArchivoResumen
  let delAlumno: ArchivoResumen

  beforeAll(async () => {
    delProfesor = await subir(PROFESOR, secciones.s1, 'Guía 1.pdf')
    delAlumno = await subir(ALUMNO, secciones.s1, 'entrega.ipynb')
  })

  it.each([
    ['el profesor', PROFESOR],
    ['el ayudante', AYUDANTE],
    ['el Director, en solo lectura', DIRECTOR],
  ])('%s descarga cualquier archivo de la sección', async (_quien, correo) => {
    for (const archivo of [delProfesor, delAlumno]) {
      const descarga = await descargar(correo, secciones.s1, archivo.id)
      expect(descarga.url).toBe(
        `https://s3.test/${await claveDe(archivo.id)}?nombre=${encodeURIComponent(archivo.nombre)}`,
      )
      expect(new Date(descarga.expiraEn).getTime()).toBeGreaterThan(Date.now())
    }
  })

  it('un alumno descarga lo del equipo docente y lo suyo', async () => {
    await descargar(ALUMNO, secciones.s1, delProfesor.id)
    await descargar(ALUMNO, secciones.s1, delAlumno.id)
    await descargar(demo.alumno2, secciones.s1, delProfesor.id)
  })

  it('un alumno no descarga la entrega de otro alumno: 404', async () => {
    await descargar(demo.alumno2, secciones.s1, delAlumno.id, 404)
  })

  it('un usuario que no pertenece a la sección recibe 403 aunque tenga el id', async () => {
    await descargar(demo.alumnoFuera, secciones.s1, delProfesor.id, 403)
    await descargar(demo.profesor2, secciones.s1, delProfesor.id, 403)
  })

  it('el Administrativo de la facultad recibe 403', async () => {
    await descargar(ADMIN_INGENIERIA, secciones.s1, delProfesor.id, 403)
  })

  it('responde 404 desde otra sección o si la subida no está confirmada', async () => {
    await descargar(demo.profesor2, secciones.s2, delProfesor.id, 404)
    const { archivo } = await pedirSubida(PROFESOR, secciones.s1, BODY)
    await descargar(PROFESOR, secciones.s1, archivo.id, 404)
  })

  it('responde 404 si el archivo está archivado', async () => {
    const archivo = await subir(PROFESOR, secciones.s1)
    await bd.query('UPDATE archivo SET archived_at = now() WHERE id = $1', [
      archivo.id,
    ])
    await descargar(PROFESOR, secciones.s1, archivo.id, 404)
  })
})

describe('MAT-01: RLS y restricciones de archivo', () => {
  // Como la API: rol cursus_app, universidad y rol de la sesión, y el usuario
  // que fija fijarUsuario (app.usuario_id), si se indica.
  async function comoApp(
    sesion: { universidadId: string; rol: string; usuarioId?: string },
    prueba: (q: QueryRunner) => Promise<void>,
  ) {
    const q = bd.createQueryRunner()
    await q.startTransaction()
    try {
      await q.query('SET LOCAL ROLE cursus_app')
      await q.query(
        `SELECT set_config('app.universidad_id', $1, true), set_config('app.rol', $2, true),
                set_config('app.usuario_id', $3, true)`,
        [sesion.universidadId, sesion.rol, sesion.usuarioId ?? ''],
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

  // Fila válida de un archivo de ICC101-1 subido por el profesor.
  async function filaValida() {
    const id = '00000000-0000-4000-8000-0000000000aa'
    const universidad = await universidadDe('norte.cursus.test')
    return {
      id,
      universidad,
      valores: [
        id,
        universidad,
        secciones.s1,
        await idDe(PROFESOR),
        'PROFESOR',
        'guia.pdf',
        'application/pdf',
        10,
        `${universidad}/${secciones.s1}/${id}`,
      ],
    }
  }
  const INSERTAR = `INSERT INTO archivo
    (id, universidad_id, seccion_id, subido_por, subido_como, nombre, tipo, tamano, clave)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`

  it('otra universidad no lee los archivos; el Director sí', async () => {
    const norte = await universidadDe('norte.cursus.test')
    const sur = await universidadDe('sur.cursus.test')
    const total = await archivosEnBase()
    expect(total).toBeGreaterThan(0)

    await comoApp({ universidadId: sur, rol: 'PROFESOR' }, async (q) => {
      expect(await q.query('SELECT id FROM archivo')).toEqual([])
    })
    await comoApp({ universidadId: sur, rol: 'DIRECTOR' }, async (q) => {
      expect(await q.query('SELECT id FROM archivo')).toHaveLength(total)
    })
    await comoApp({ universidadId: norte, rol: 'ALUMNO' }, async (q) => {
      expect(await q.query('SELECT id FROM archivo')).toHaveLength(total)
    })
  })

  it.each(['DIRECTOR', 'ADMINISTRATIVO'])(
    'la API con rol %s no puede registrar archivos',
    async (rol) => {
      const { universidad, valores } = await filaValida()
      await comoApp({ universidadId: universidad, rol }, async (q) => {
        await expect(q.query(INSERTAR, valores)).rejects.toMatchObject({
          code: SIN_PERMISO,
        })
      })
    },
  )

  it('la API no registra archivos en otra universidad', async () => {
    const { valores } = await filaValida()
    const sur = await universidadDe('sur.cursus.test')
    await comoApp({ universidadId: sur, rol: 'PROFESOR' }, async (q) => {
      await expect(q.query(INSERTAR, valores)).rejects.toMatchObject({
        code: SIN_PERMISO,
      })
    })
  })

  it('el profesor registra un archivo propio con su usuario fijado', async () => {
    const { universidad, valores } = await filaValida()
    await comoApp(
      {
        universidadId: universidad,
        rol: 'PROFESOR',
        usuarioId: await idDe(PROFESOR),
      },
      async (q) => {
        await q.query(INSERTAR, valores)
      },
    )
  })

  it.each([
    ['sin usuario fijado', () => Promise.resolve(undefined)],
    ['a nombre de otro usuario', () => idDe(ALUMNO)],
  ])('con SQL directo nadie registra un archivo %s', async (_caso, usuario) => {
    const { universidad, valores } = await filaValida()
    const usuarioId = await usuario()
    // La fila dice subido_por = profesor, pero quien escribe es otro.
    await comoApp(
      { universidadId: universidad, rol: 'ALUMNO', usuarioId },
      async (q) => {
        await expect(q.query(INSERTAR, valores)).rejects.toMatchObject({
          code: SIN_PERMISO,
        })
      },
    )
  })

  it('con SQL directo nadie modifica un archivo ajeno', async () => {
    const universidad = await universidadDe('norte.cursus.test')
    const [ajeno] = await bd.query<{ id: string; nombre: string }[]>(
      `SELECT id, nombre FROM archivo
        WHERE subido_por = $1 AND subido_at IS NOT NULL AND archived_at IS NULL
        LIMIT 1`,
      [await idDe(PROFESOR)],
    )
    await comoApp(
      {
        universidadId: universidad,
        rol: 'ALUMNO',
        usuarioId: await idDe(ALUMNO),
      },
      async (q) => {
        const cambiadas = await q.query<{ id: string }[]>(
          `WITH cambio AS (
             UPDATE archivo SET archived_at = now(), nombre = 'otro.pdf'
              WHERE id = $1 RETURNING id
           )
           SELECT id FROM cambio`,
          [ajeno.id],
        )
        expect(cambiadas).toEqual([])
      },
    )
    const [despues] = await bd.query<
      { nombre: string; archived_at: Date | null }[]
    >('SELECT nombre, archived_at FROM archivo WHERE id = $1', [ajeno.id])
    expect(despues).toEqual({ nombre: ajeno.nombre, archived_at: null })
  })

  it('con SQL directo nadie pasa un archivo propio a nombre de otro', async () => {
    const universidad = await universidadDe('norte.cursus.test')
    const alumno = await idDe(ALUMNO)
    const [propio] = await bd.query<{ id: string }[]>(
      'SELECT id FROM archivo WHERE subido_por = $1 LIMIT 1',
      [alumno],
    )
    await comoApp(
      { universidadId: universidad, rol: 'ALUMNO', usuarioId: alumno },
      async (q) => {
        await expect(
          q.query('UPDATE archivo SET subido_por = $2 WHERE id = $1', [
            propio.id,
            await idDe(demo.alumno2),
          ]),
        ).rejects.toMatchObject({ code: SIN_PERMISO })
      },
    )
  })

  it('la API no puede borrar archivos', async () => {
    const norte = await universidadDe('norte.cursus.test')
    await comoApp({ universidadId: norte, rol: 'PROFESOR' }, async (q) => {
      await expect(q.query('DELETE FROM archivo')).rejects.toMatchObject({
        code: SIN_PERMISO,
      })
    })
  })

  it.each([
    ['una clave que no corresponde al archivo', 8, 'otra/llave'],
    ['un tamaño mayor a 20 MB', 7, 20 * 1024 * 1024 + 1],
    ['un rol que no sube archivos', 4, 'DIRECTOR'],
    ['un nombre con espacios al borde', 5, ' guia.pdf'],
  ])('la base rechaza %s', async (_caso, indice, valor) => {
    const { valores } = await filaValida()
    valores[indice] = valor
    await expect(bd.query(INSERTAR, valores)).rejects.toMatchObject({
      code: '23514',
    })
  })
})
