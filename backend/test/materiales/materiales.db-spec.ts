import type { Material, Rol, SubidaArchivo } from '@cursus/shared'
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
import { ROL_APP } from '../../src/database/base-de-datos.service.js'
import { crearSuperadmin } from '../../src/database/crear-superadmin.js'
import { opcionesDataSource } from '../../src/database/data-source.js'
import { ejecutarSeed } from '../../src/database/seed.js'

// MAT-04: base propia con el seed cargado, que se crea y se borra en cada
// ejecución. Todos los usuarios del seed comparten la contraseña.
const BD_TEST = `${process.env.POSTGRES_TEST_DB ?? 'cursus_test'}_materiales`
const PASSWORD = 'contraseña-de-prueba'
const BD_ORIGINAL = process.env.POSTGRES_DB

// Códigos de error de PostgreSQL.
const CHECK = '23514'
const UNIQUE = '23505'
const SIN_PERMISO = '42501'

const PROFESOR = 'profesor@norte.cursus.test'
const AYUDANTE = 'ayudante@norte.cursus.test'
const ALUMNO = 'alumno@norte.cursus.test'
const ADMIN_INGENIERIA = 'administrativo.ingenieria@norte.cursus.test'
const DIRECTOR = 'director@norte.cursus.test'
const PROFESOR_SUR = 'profesor@sur.cursus.test'
// Usuarios propios de este test (el seed no trae suficientes): se crean en
// armarEscenario. PROFESOR_S2 es profesor de ICC101-2, del mismo curso que
// ICC101-1; PROFESOR_S1 es el segundo profesor de ICC101-1 (GES-25);
// PROFESOR_OTRO_CURSO lo es de ICC201-1. ALUMNO_S2 está en ICC101-2 y
// ALUMNO_FUERA en ninguna sección de ICC101.
const PROFESOR_S2 = 'profesor.s2@norte.cursus.test'
const PROFESOR_S1 = 'profesor.s1@norte.cursus.test'
const PROFESOR_OTRO_CURSO = 'profesor.otro@norte.cursus.test'
const ALUMNO_S2 = 'alumno.s2@norte.cursus.test'
const ALUMNO_FUERA = 'alumno.fuera@norte.cursus.test'
// Cuenta de profesor que en ICC101-1 es ayudante: su rol en la sección no es
// PROFESOR.
const PROFESOR_AYUDANTE = 'profesor.ayudante@norte.cursus.test'

// S3 en memoria, como en MAT-01: firma sin red y guarda lo que "subió" el
// navegador.
class AlmacenamientoFalso {
  readonly objetos = new Map<string, ObjetoSubido>()
  disponible = true

  private conectado() {
    if (!this.disponible) {
      throw new ServiceUnavailableException('Sin almacenamiento')
    }
  }

  firmarSubida(clave: string, tipo: string) {
    this.conectado()
    return Promise.resolve({
      url: 'https://s3.test/',
      campos: { key: clave, 'Content-Type': tipo },
      expiraEn: new Date(Date.now() + 600_000),
    })
  }

  firmarDescarga(clave: string) {
    this.conectado()
    return Promise.resolve({
      url: `https://s3.test/${clave}`,
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

// ICC101 secciones 1 y 2 (mismo curso) e ICC201 sección 1 (otro curso).
const secciones = { s1: '', s2: '', otroCurso: '' }

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
async function pedirSubida(correo: string, seccionId: string, nombre: string) {
  const token = await tokenDe(correo)
  const respuesta = await request(app.getHttpServer())
    .post(`/api/espacio/secciones/${seccionId}/archivos`)
    .set('Authorization', `Bearer ${token}`)
    .send({ nombre, tamano: 100 })
    .expect(201)
  return respuesta.body as SubidaArchivo
}

async function confirmar(correo: string, seccionId: string, archivoId: string) {
  const token = await tokenDe(correo)
  await request(app.getHttpServer())
    .post(`/api/espacio/secciones/${seccionId}/archivos/${archivoId}/confirmar`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200)
}

// El flujo de MAT-01: pide la subida, "sube" el objeto y lo confirma. Con
// confirmado = false se queda antes de confirmar. Devuelve el id del archivo.
async function subir(
  correo: string,
  seccionId: string,
  nombre = 'guia.pdf',
  confirmado = true,
) {
  const { archivo } = await pedirSubida(correo, seccionId, nombre)
  if (confirmado) {
    const [{ clave }] = await bd.query<{ clave: string }[]>(
      'SELECT clave FROM archivo WHERE id = $1',
      [archivo.id],
    )
    almacenamiento.objetos.set(clave, {
      tamano: archivo.tamano,
      tipo: archivo.tipo,
    })
    await confirmar(correo, seccionId, archivo.id)
  }
  return archivo.id
}

async function registrar(
  correo: string,
  seccionId: string,
  body: object,
  estado: number,
) {
  const token = await tokenDe(correo)
  const respuesta = await request(app.getHttpServer())
    .post(`/api/espacio/secciones/${seccionId}/materiales`)
    .set('Authorization', `Bearer ${token}`)
    .send(body)
    .expect(estado)
  return respuesta.body as Material & { message?: string | string[] }
}

async function listar(correo: string, seccionId: string, estado = 200) {
  const token = await tokenDe(correo)
  const respuesta = await request(app.getHttpServer())
    .get(`/api/espacio/secciones/${seccionId}/materiales`)
    .set('Authorization', `Bearer ${token}`)
    .expect(estado)
  return respuesta.body as Material[]
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

const cursoDe = async (seccionId: string) =>
  (
    await bd.query<{ curso_id: string }[]>(
      'SELECT curso_id FROM seccion WHERE id = $1',
      [seccionId],
    )
  )[0].curso_id

const universidadDe = async (dominio: string) =>
  (
    await bd.query<{ id: string }[]>(
      'SELECT id FROM universidad WHERE dominio_correo = $1',
      [dominio],
    )
  )[0].id

const materialesEnBase = async () =>
  Number(
    (
      await bd.query<{ cantidad: string }[]>(
        'SELECT count(*) AS cantidad FROM material',
      )
    )[0].cantidad,
  )

// Archivo confirmado (o no) escrito como dueño de las tablas, sin pasar por la
// API: para las pruebas de la base.
async function archivoSql(
  seccionId: string,
  subidoPor: string,
  opciones: { confirmado?: boolean; archivado?: boolean } = {},
) {
  const { confirmado = true, archivado = false } = opciones
  const [{ id }] = await bd.query<{ id: string }[]>(
    `WITH nuevo AS (SELECT gen_random_uuid() AS id)
     INSERT INTO archivo (id, universidad_id, seccion_id, subido_por, subido_como,
                          nombre, tipo, tamano, clave, subido_at, archived_at)
     SELECT n.id, s.universidad_id, s.id, $2, 'PROFESOR', 'a.pdf', 'application/pdf', 10,
            s.universidad_id || '/' || s.id || '/' || n.id,
            CASE WHEN $3 THEN now() END, CASE WHEN $4 THEN now() END
       FROM seccion s, nuevo n WHERE s.id = $1
     RETURNING id`,
    [seccionId, await idDe(subidoPor), confirmado, archivado],
  )
  return id
}

interface SesionRls {
  universidadId: string
  rol: Rol
  // Si falta, no se fija el usuario de la sesión (usuario_actual() es NULL).
  usuarioId?: string
}

// Consulta con el rol de la API, en una transacción que se revierte.
async function comoApp(
  sesion: SesionRls,
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

// Escenario, armado como dueño de las tablas (sin RLS).
async function armarEscenario() {
  secciones.s1 = await seccionDe('ICC101', 1)
  secciones.s2 = await seccionDe('ICC101', 2)
  secciones.otroCurso = await seccionDe('ICC201', 1)

  // Usuarios propios de este test, con la contraseña y la facultad de los del
  // seed (los de demo del seed no alcanzan para todos los casos).
  const crearUsuario = (correo: string, plantilla: string) =>
    bd.query(
      `INSERT INTO usuario (universidad_id, facultad_id, nombre, correo, password_hash, rol)
       SELECT universidad_id, facultad_id, 'Usuario de prueba', $1, password_hash, rol
         FROM usuario WHERE correo = $2`,
      [correo, plantilla],
    )
  for (const correo of [
    PROFESOR_S2,
    PROFESOR_S1,
    PROFESOR_OTRO_CURSO,
    PROFESOR_AYUDANTE,
  ]) {
    await crearUsuario(correo, PROFESOR)
  }
  for (const correo of [ALUMNO_S2, ALUMNO_FUERA]) {
    await crearUsuario(correo, ALUMNO)
  }

  // El archivado de un profesor anterior no importa: seccion.profesor_id se
  // sincroniza con seccion_profesor (GES-25).
  const aCargo = async (seccionId: string, correo: string) =>
    bd.query<unknown>('UPDATE seccion SET profesor_id = $2 WHERE id = $1', [
      seccionId,
      await idDe(correo),
    ])
  await aCargo(secciones.s1, PROFESOR)
  await aCargo(secciones.s2, PROFESOR_S2)
  await aCargo(secciones.otroCurso, PROFESOR_OTRO_CURSO)
  // GES-25: segundo profesor de la sección 1, sin tocar al primero.
  await bd.query(
    `INSERT INTO seccion_profesor (universidad_id, seccion_id, usuario_id)
     SELECT universidad_id, id, $2 FROM seccion WHERE id = $1`,
    [secciones.s1, await idDe(PROFESOR_S1)],
  )

  await bd.query(
    `INSERT INTO ayudante_seccion (universidad_id, seccion_id, usuario_id)
     SELECT s.universidad_id, s.id, $2 FROM seccion s
      WHERE s.id = $1 AND NOT EXISTS (
        SELECT 1 FROM ayudante_seccion a
         WHERE a.seccion_id = s.id AND a.usuario_id = $2 AND a.archived_at IS NULL)`,
    [secciones.s1, await idDe(AYUDANTE)],
  )
  await bd.query(
    `INSERT INTO ayudante_seccion (universidad_id, seccion_id, usuario_id)
     SELECT universidad_id, id, $2 FROM seccion WHERE id = $1`,
    [secciones.s1, await idDe(PROFESOR_AYUDANTE)],
  )

  // El alumno base en ICC101-1, el alumnoS2 en ICC101-2 y alumnoFuera en
  // ninguna sección de ICC101.
  await bd.query(
    `UPDATE inscripcion i SET archived_at = now(), archivada_por = $2
      FROM seccion s, curso c, usuario u
     WHERE s.id = i.seccion_id AND c.id = s.curso_id AND c.codigo = 'ICC101'
       AND u.id = i.usuario_id AND u.correo = ANY($1) AND i.archived_at IS NULL`,
    [[ALUMNO, ALUMNO_S2, ALUMNO_FUERA], await idDe(ADMIN_INGENIERIA)],
  )
  for (const [seccionId, correo] of [
    [secciones.s1, ALUMNO],
    [secciones.s2, ALUMNO_S2],
  ]) {
    await bd.query(
      `INSERT INTO inscripcion (universidad_id, seccion_id, usuario_id)
       SELECT universidad_id, $1, $2 FROM seccion WHERE id = $1`,
      [seccionId, await idDe(correo)],
    )
  }
  // El alumno de afuera tampoco está inscrito en el otro curso.
  await bd.query(
    `UPDATE inscripcion SET archived_at = now(), archivada_por = $2
      WHERE usuario_id = $1 AND archived_at IS NULL`,
    [await idDe(ALUMNO_FUERA), await idDe(ADMIN_INGENIERIA)],
  )
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
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
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

describe('POST /api/espacio/secciones/:id/materiales (MAT-04)', () => {
  it('el profesor registra un archivo confirmado como material del curso, con su categoría', async () => {
    const archivoId = await subir(PROFESOR, secciones.s1, 'Guía 1.pdf')

    const creado = await registrar(
      PROFESOR,
      secciones.s1,
      {
        archivoId,
        categoria: 'GUIA',
        titulo: '  Guía   de   ejercicios 1 ',
        descripcion: '  Funciones y listas.\nPáginas 1 a 5.  ',
      },
      201,
    )

    expect(creado).toEqual({
      id: expect.any(String) as string,
      categoria: 'GUIA',
      titulo: 'Guía de ejercicios 1',
      descripcion: 'Funciones y listas.\nPáginas 1 a 5.',
      archivo: {
        id: archivoId,
        nombre: 'Guía 1.pdf',
        tipo: 'application/pdf',
        tamano: 100,
        subidoEn: expect.any(String) as string,
      },
      creadoEn: expect.any(String) as string,
    })
    // Queda asociado al curso, no a la sección ni solo al profesor.
    const [fila] = await bd.query<
      { curso_id: string; subido_por: string; archivo_id: string }[]
    >('SELECT curso_id, subido_por, archivo_id FROM material WHERE id = $1', [
      creado.id,
    ])
    expect(fila).toEqual({
      curso_id: await cursoDe(secciones.s1),
      subido_por: await idDe(PROFESOR),
      archivo_id: archivoId,
    })
  })

  it('la descripción es opcional y una vacía queda como NULL', async () => {
    for (const cuerpo of [{}, { descripcion: '   ' }]) {
      const archivoId = await subir(PROFESOR, secciones.s1)
      const creado = await registrar(
        PROFESOR,
        secciones.s1,
        { archivoId, categoria: 'PRESENTACION', titulo: 'Clase 1', ...cuerpo },
        201,
      )
      expect(creado.descripcion).toBeNull()
    }
  })

  it.each(['GUIA', 'PRESENTACION', 'PRUEBA_ANTERIOR', 'CODIGO'] as const)(
    'acepta la categoría %s',
    async (categoria) => {
      const archivoId = await subir(PROFESOR, secciones.s1, 'codigo.ipynb')
      const creado = await registrar(
        PROFESOR,
        secciones.s1,
        { archivoId, categoria, titulo: `Material ${categoria}` },
        201,
      )
      expect(creado.categoria).toBe(categoria)
    },
  )

  it('no guarda bytes en PostgreSQL: solo referencia al archivo de MAT-01', async () => {
    const columnas = await bd.query<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'material' AND data_type = 'bytea'`,
    )
    expect(columnas).toEqual([])
  })

  it('un segundo profesor de la misma sección (GES-25) también registra', async () => {
    const archivoId = await subir(PROFESOR_S1, secciones.s1)
    await registrar(
      PROFESOR_S1,
      secciones.s1,
      { archivoId, categoria: 'GUIA', titulo: 'Del co-profesor' },
      201,
    )
  })

  describe('el material es del curso y lo hereda el resto de sus profesores', () => {
    it('el profesor de otra sección del curso lo registra y los demás profesores lo ven', async () => {
      const archivoId = await subir(PROFESOR_S2, secciones.s2, 'otra.pdf')
      const creado = await registrar(
        PROFESOR_S2,
        secciones.s2,
        { archivoId, categoria: 'PRUEBA_ANTERIOR', titulo: 'Solemne 2025' },
        201,
      )

      // Lo ven el profesor de la sección 1 y el de la sección 2.
      for (const [correo, seccionId] of [
        [PROFESOR, secciones.s1],
        [PROFESOR_S1, secciones.s1],
        [PROFESOR_S2, secciones.s2],
      ]) {
        const lista = await listar(correo, seccionId)
        expect(lista.map((m) => m.id)).toContain(creado.id)
      }
    })

    it('un profesor de otro curso no ve los materiales de ICC101', async () => {
      // No es integrante de ICC101-1: el guard responde 403.
      await listar(PROFESOR_OTRO_CURSO, secciones.s1, 403)
      // En su propio curso, la lista no incluye los de ICC101.
      expect(await listar(PROFESOR_OTRO_CURSO, secciones.otroCurso)).toEqual([])
    })
  })

  describe('400: el archivo no calza', () => {
    it('sin confirmar', async () => {
      const archivoId = await subir(PROFESOR, secciones.s1, 'a.pdf', false)
      const antes = await materialesEnBase()
      const respuesta = await registrar(
        PROFESOR,
        secciones.s1,
        { archivoId, categoria: 'GUIA', titulo: 'Sin confirmar' },
        400,
      )
      expect(respuesta.message).toMatch(/confirmado/)
      expect(await materialesEnBase()).toBe(antes)
    })

    it('de otra sección, aunque sea del mismo curso', async () => {
      const archivoId = await subir(PROFESOR_S2, secciones.s2)
      await registrar(
        PROFESOR_S2,
        secciones.s1,
        { archivoId, categoria: 'GUIA', titulo: 'Otra sección' },
        // El profesor de la sección 2 no es integrante de la 1: 403. Lo
        // registra el profesor de la 1 con el archivo de la 2, que no es suyo.
        403,
      )
      await registrar(
        PROFESOR,
        secciones.s1,
        { archivoId, categoria: 'GUIA', titulo: 'Otra sección' },
        400,
      )
    })

    it('de otro curso', async () => {
      const archivoId = await subir(PROFESOR, secciones.s1)
      // Del curso ICC201, que no es el de la sección donde se registra.
      await registrar(
        PROFESOR_OTRO_CURSO,
        secciones.otroCurso,
        { archivoId, categoria: 'GUIA', titulo: 'Otro curso' },
        400,
      )
    })

    it('subido por otra persona de la sección', async () => {
      const archivoId = await subir(AYUDANTE, secciones.s1)
      await registrar(
        PROFESOR,
        secciones.s1,
        { archivoId, categoria: 'GUIA', titulo: 'Ajeno' },
        400,
      )
    })

    it('archivado o inexistente', async () => {
      const archivado = await archivoSql(secciones.s1, PROFESOR, {
        archivado: true,
      })
      for (const archivoId of [
        archivado,
        '00000000-0000-4000-8000-000000000999',
      ]) {
        await registrar(
          PROFESOR,
          secciones.s1,
          { archivoId, categoria: 'GUIA', titulo: 'No existe' },
          400,
        )
      }
    })

    it('de otra universidad', async () => {
      const sur = await bd.query<{ id: string }[]>(
        `SELECT s.id FROM seccion s JOIN universidad u ON u.id = s.universidad_id
          WHERE u.dominio_correo = 'sur.cursus.test' LIMIT 1`,
      )
      const archivoId = await archivoSql(sur[0].id, PROFESOR_SUR)
      await registrar(
        PROFESOR,
        secciones.s1,
        { archivoId, categoria: 'GUIA', titulo: 'De otra universidad' },
        400,
      )
    })
  })

  describe('400: datos inválidos', () => {
    let archivoId: string
    beforeAll(async () => {
      archivoId = await subir(PROFESOR, secciones.s1)
    })
    const valido = () => ({
      archivoId,
      categoria: 'GUIA',
      titulo: 'Título',
    })

    it.each([
      ['sin archivo', { archivoId: undefined }],
      ['archivo que no es un UUID', { archivoId: 'no-es-uuid' }],
      ['sin categoría', { categoria: undefined }],
      ['categoría fuera de la lista', { categoria: 'APUNTES' }],
      ['categoría en minúsculas', { categoria: 'guia' }],
      ['sin título', { titulo: undefined }],
      ['título vacío o solo espacios', { titulo: '   ' }],
      ['título de más de 100 caracteres', { titulo: 'x'.repeat(101) }],
      ['título con un carácter de control', { titulo: 'Guía\u0000' }],
      [
        'descripción de más de 1000 caracteres',
        { descripcion: 'x'.repeat(1001) },
      ],
      [
        'descripción con un carácter de control',
        { descripcion: 'Texto\u0007' },
      ],
      ['descripción que no es texto', { descripcion: 5 }],
      ['un campo no esperado', { cursoId: secciones.s2 }],
    ])('%s', async (_caso, cambio) => {
      const antes = await materialesEnBase()
      await registrar(PROFESOR, secciones.s1, { ...valido(), ...cambio }, 400)
      expect(await materialesEnBase()).toBe(antes)
    })
  })

  describe('403: solo el profesor de la sección', () => {
    it.each([
      ['el ayudante', AYUDANTE],
      ['un alumno inscrito', ALUMNO],
      ['el Administrativo', ADMIN_INGENIERIA],
      ['el Director', DIRECTOR],
      ['un profesor de otra sección', PROFESOR_S2],
      ['un profesor de otro curso', PROFESOR_OTRO_CURSO],
      [
        'una cuenta de profesor que es ayudante de la sección',
        PROFESOR_AYUDANTE,
      ],
    ])('%s', async (_quien, correo) => {
      const archivoId = await subir(PROFESOR, secciones.s1)
      const antes = await materialesEnBase()
      await registrar(
        correo,
        secciones.s1,
        { archivoId, categoria: 'GUIA', titulo: 'No debería' },
        403,
      )
      expect(await materialesEnBase()).toBe(antes)
    })
  })

  it('un profesor de otra universidad recibe 404: la sección no existe para él', async () => {
    const archivoId = await subir(PROFESOR, secciones.s1)
    const antes = await materialesEnBase()
    await registrar(
      PROFESOR_SUR,
      secciones.s1,
      { archivoId, categoria: 'GUIA', titulo: 'No debería' },
      404,
    )
    expect(await materialesEnBase()).toBe(antes)
  })

  describe('409: el archivo ya es un material', () => {
    it('al registrarlo dos veces', async () => {
      const archivoId = await subir(PROFESOR, secciones.s1)
      await registrar(
        PROFESOR,
        secciones.s1,
        { archivoId, categoria: 'GUIA', titulo: 'Primero' },
        201,
      )
      const antes = await materialesEnBase()
      await registrar(
        PROFESOR,
        secciones.s1,
        { archivoId, categoria: 'CODIGO', titulo: 'Segundo' },
        409,
      )
      expect(await materialesEnBase()).toBe(antes)
    })

    it('al registrarlo a la vez, solo uno gana', async () => {
      const archivoId = await subir(PROFESOR, secciones.s1)
      const token = await tokenDe(PROFESOR)
      const enviar = (titulo: string) =>
        request(app.getHttpServer())
          .post(`/api/espacio/secciones/${secciones.s1}/materiales`)
          .set('Authorization', `Bearer ${token}`)
          .send({ archivoId, categoria: 'GUIA', titulo })
      const estados = (await Promise.all([enviar('A'), enviar('B')]))
        .map((r) => r.status)
        .sort()
      expect(estados).toEqual([201, 409])
    })
  })
})

describe('GET /api/espacio/secciones/:id/materiales (MAT-04)', () => {
  it('el profesor ve los materiales del curso, del más reciente al más antiguo', async () => {
    const primero = await registrar(
      PROFESOR,
      secciones.s1,
      {
        archivoId: await subir(PROFESOR, secciones.s1),
        categoria: 'GUIA',
        titulo: 'Para ordenar 1',
      },
      201,
    )
    const segundo = await registrar(
      PROFESOR,
      secciones.s1,
      {
        archivoId: await subir(PROFESOR, secciones.s1),
        categoria: 'CODIGO',
        titulo: 'Para ordenar 2',
      },
      201,
    )
    const lista = await listar(PROFESOR, secciones.s1)
    const ids = lista.map((m) => m.id)
    expect(ids.indexOf(segundo.id)).toBeLessThan(ids.indexOf(primero.id))
    expect(lista.find((m) => m.id === primero.id)).toEqual(primero)
  })

  it('no incluye los materiales archivados', async () => {
    const creado = await registrar(
      PROFESOR,
      secciones.s1,
      {
        archivoId: await subir(PROFESOR, secciones.s1),
        categoria: 'GUIA',
        titulo: 'Se archiva',
      },
      201,
    )
    await bd.query('UPDATE material SET archived_at = now() WHERE id = $1', [
      creado.id,
    ])
    expect(
      (await listar(PROFESOR, secciones.s1)).map((m) => m.id),
    ).not.toContain(creado.id)
  })

  it.each([
    ['el ayudante', AYUDANTE],
    ['un alumno inscrito', ALUMNO],
    ['el Administrativo', ADMIN_INGENIERIA],
    ['el Director', DIRECTOR],
    ['un profesor de otro curso', PROFESOR_OTRO_CURSO],
  ])(
    '%s recibe 403 (el listado para ellos es de MAT-05)',
    async (_q, correo) => {
      await listar(correo, secciones.s1, 403)
    },
  )
})

// Material de prueba para las políticas: del curso ICC101, subido por PROFESOR
// con un archivo propio de la sección 1.
async function materialSql(titulo = 'Material de prueba') {
  const archivoId = await archivoSql(secciones.s1, PROFESOR)
  const [{ id }] = await bd.query<{ id: string }[]>(
    `INSERT INTO material (universidad_id, curso_id, archivo_id, categoria, titulo, subido_por)
     SELECT s.universidad_id, s.curso_id, $2, 'GUIA', $3, $4 FROM seccion s WHERE s.id = $1
     RETURNING id`,
    [secciones.s1, archivoId, titulo, await idDe(PROFESOR)],
  )
  return id
}

describe('RLS y restricciones de material (SQL directo)', () => {
  let norte: string
  let sur: string
  let cursoIcc101: string
  const usuarios: Record<string, string> = {}

  beforeAll(async () => {
    norte = await universidadDe('norte.cursus.test')
    sur = await universidadDe('sur.cursus.test')
    cursoIcc101 = await cursoDe(secciones.s1)
    for (const correo of [
      PROFESOR,
      PROFESOR_S1,
      PROFESOR_S2,
      PROFESOR_OTRO_CURSO,
      AYUDANTE,
      ALUMNO,
      ALUMNO_S2,
      ALUMNO_FUERA,
      ADMIN_INGENIERIA,
      DIRECTOR,
      PROFESOR_SUR,
    ]) {
      usuarios[correo] = await idDe(correo)
    }
  })

  // INSERT como `correo` (con su rol de cuenta) en su universidad, sobre el
  // archivo dado.
  const insertar = (
    q: QueryRunner,
    archivoId: string,
    datos: {
      universidadId?: string
      cursoId?: string
      subidoPor?: string
      categoria?: string
      titulo?: string
      descripcion?: string | null
    } = {},
  ) =>
    q.query(
      `INSERT INTO material (universidad_id, curso_id, archivo_id, categoria, titulo, descripcion, subido_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        datos.universidadId ?? norte,
        datos.cursoId ?? cursoIcc101,
        archivoId,
        datos.categoria ?? 'GUIA',
        datos.titulo ?? 'Título',
        datos.descripcion ?? null,
        datos.subidoPor ?? usuarios[PROFESOR],
      ],
    )

  describe('INSERT', () => {
    it.each([
      ['el profesor de la sección', PROFESOR, 'PROFESOR'],
      ['un segundo profesor de la sección (GES-25)', PROFESOR_S1, 'PROFESOR'],
      // Co-profesor: de otra sección del mismo curso, con un archivo suyo.
      ['el profesor de otra sección del curso', PROFESOR_S2, 'PROFESOR'],
    ])('%s registra a su nombre', async (_quien, correo, rol) => {
      const seccion = correo === PROFESOR_S2 ? secciones.s2 : secciones.s1
      const archivoId = await archivoSql(seccion, correo)
      await comoApp(
        {
          universidadId: norte,
          rol: rol as Rol,
          usuarioId: usuarios[correo],
        },
        async (q) => {
          await insertar(q, archivoId, {
            subidoPor: usuarios[correo],
          })
          expect(
            await q.query('SELECT id FROM material WHERE archivo_id = $1', [
              archivoId,
            ]),
          ).toHaveLength(1)
        },
      )
    })

    it.each([
      ['el ayudante de la sección', AYUDANTE, 'AYUDANTE'],
      ['un alumno de la sección', ALUMNO, 'ALUMNO'],
      ['el Administrativo', ADMIN_INGENIERIA, 'ADMINISTRATIVO'],
      ['el Director', DIRECTOR, 'DIRECTOR'],
    ])('%s no registra: 42501', async (_quien, correo, rol) => {
      const archivoId = await archivoSql(secciones.s1, correo)
      await comoApp(
        {
          universidadId: norte,
          rol: rol as Rol,
          usuarioId: usuarios[correo],
        },
        async (q) => {
          await expect(
            insertar(q, archivoId, { subidoPor: usuarios[correo] }),
          ).rejects.toMatchObject({ code: SIN_PERMISO })
        },
      )
    })

    it('un profesor de otro curso no registra en ICC101: 42501', async () => {
      // tg_material_validar corre antes que la RLS, así que el archivo debe
      // calzar con el curso para llegar a ella.
      const archivoId = await archivoSql(secciones.s1, PROFESOR_OTRO_CURSO)
      await comoApp(
        {
          universidadId: norte,
          rol: 'PROFESOR',
          usuarioId: usuarios[PROFESOR_OTRO_CURSO],
        },
        async (q) => {
          await expect(
            insertar(q, archivoId, {
              subidoPor: usuarios[PROFESOR_OTRO_CURSO],
            }),
          ).rejects.toMatchObject({ code: SIN_PERMISO })
        },
      )
    })

    it('un profesor de otra universidad no registra, con su universidad ni con la de Norte', async () => {
      // Aquí tg_material_validar corre antes que la RLS y ya lo rechaza: el
      // archivo de Norte no existe para la universidad Sur (CHECK), o la
      // política lo niega (42501). Con cualquiera no queda nada.
      const archivoId = await archivoSql(secciones.s1, PROFESOR)
      for (const universidadId of [sur, norte]) {
        await comoApp(
          {
            universidadId: sur,
            rol: 'PROFESOR',
            usuarioId: usuarios[PROFESOR_SUR],
          },
          async (q) => {
            await expect(
              insertar(q, archivoId, {
                universidadId,
                subidoPor: usuarios[PROFESOR_SUR],
              }),
            ).rejects.toSatisfy((error: { code?: string }) =>
              [SIN_PERMISO, CHECK].includes(error.code ?? ''),
            )
          },
        )
      }
    })

    it('exige que la sesión sea de un profesor: 42501 con otro rol aunque el usuario lo sea', async () => {
      const archivoId = await archivoSql(secciones.s1, PROFESOR)
      await comoApp(
        {
          universidadId: norte,
          rol: 'ADMINISTRATIVO',
          usuarioId: usuarios[PROFESOR],
        },
        async (q) => {
          await expect(insertar(q, archivoId)).rejects.toMatchObject({
            code: SIN_PERMISO,
          })
        },
      )
    })

    it('exige subido_por = el usuario de la sesión: 42501 a nombre de otro o sin usuario fijado', async () => {
      const archivoId = await archivoSql(secciones.s1, PROFESOR)
      // El co-profesor no registra a nombre del profesor.
      await comoApp(
        {
          universidadId: norte,
          rol: 'PROFESOR',
          usuarioId: usuarios[PROFESOR_S1],
        },
        async (q) => {
          await expect(insertar(q, archivoId)).rejects.toMatchObject({
            code: SIN_PERMISO,
          })
        },
      )
      await comoApp({ universidadId: norte, rol: 'PROFESOR' }, async (q) => {
        await expect(insertar(q, archivoId)).rejects.toMatchObject({
          code: SIN_PERMISO,
        })
      })
    })

    it('el profesor que ya no está en el curso no registra: 42501', async () => {
      const archivoId = await archivoSql(secciones.s1, PROFESOR_S1)
      await bd.query(
        `UPDATE seccion_profesor SET archived_at = now()
          WHERE usuario_id = $1 AND archived_at IS NULL`,
        [usuarios[PROFESOR_S1]],
      )
      try {
        await comoApp(
          {
            universidadId: norte,
            rol: 'PROFESOR',
            usuarioId: usuarios[PROFESOR_S1],
          },
          async (q) => {
            await expect(
              insertar(q, archivoId, { subidoPor: usuarios[PROFESOR_S1] }),
            ).rejects.toMatchObject({ code: SIN_PERMISO })
          },
        )
      } finally {
        await bd.query(
          `UPDATE seccion_profesor SET archived_at = NULL
            WHERE usuario_id = $1 AND seccion_id = $2`,
          [usuarios[PROFESOR_S1], secciones.s1],
        )
      }
    })

    describe('el archivo', () => {
      const comoProfesor = (prueba: (q: QueryRunner) => Promise<void>) =>
        comoApp(
          {
            universidadId: norte,
            rol: 'PROFESOR',
            usuarioId: usuarios[PROFESOR],
          },
          prueba,
        )

      it('sin confirmar: 23514', async () => {
        const archivoId = await archivoSql(secciones.s1, PROFESOR, {
          confirmado: false,
        })
        await comoProfesor(async (q) => {
          await expect(insertar(q, archivoId)).rejects.toMatchObject({
            code: CHECK,
          })
        })
      })

      it('archivado: 23514', async () => {
        const archivoId = await archivoSql(secciones.s1, PROFESOR, {
          archivado: true,
        })
        await comoProfesor(async (q) => {
          await expect(insertar(q, archivoId)).rejects.toMatchObject({
            code: CHECK,
          })
        })
      })

      it('de una sección de otro curso: 23514', async () => {
        // El profesor de ICC101 lo sube en ICC201, donde no es profesor, con
        // SQL de dueño; aun así no calza con el curso del material.
        const archivoId = await archivoSql(secciones.otroCurso, PROFESOR)
        await comoProfesor(async (q) => {
          await expect(insertar(q, archivoId)).rejects.toMatchObject({
            code: CHECK,
          })
        })
      })

      it('subido por otra persona: 23514', async () => {
        const archivoId = await archivoSql(secciones.s1, PROFESOR_S1)
        await comoProfesor(async (q) => {
          await expect(insertar(q, archivoId)).rejects.toMatchObject({
            code: CHECK,
          })
        })
      })

      it('que no existe: 23514', async () => {
        await comoProfesor(async (q) => {
          await expect(
            insertar(q, '00000000-0000-4000-8000-000000000999'),
          ).rejects.toMatchObject({ code: CHECK })
        })
      })

      it('que ya es un material: 23505', async () => {
        const archivoId = await archivoSql(secciones.s1, PROFESOR)
        await comoProfesor(async (q) => {
          await insertar(q, archivoId)
          await q.query('SAVEPOINT duplicado')
          await expect(
            insertar(q, archivoId, { titulo: 'Otro' }),
          ).rejects.toMatchObject({ code: UNIQUE })
        })
      })
    })

    describe('los datos', () => {
      it.each([
        ['categoría fuera de la lista', { categoria: 'APUNTES' }],
        ['categoría en minúsculas', { categoria: 'guia' }],
        ['título vacío', { titulo: '' }],
        ['título con espacios al borde', { titulo: ' Guía ' }],
        ['título de más de 100 caracteres', { titulo: 'x'.repeat(101) }],
        ['descripción vacía', { descripcion: '' }],
        ['descripción con espacios al borde', { descripcion: ' texto ' }],
        [
          'descripción de más de 1000 caracteres',
          { descripcion: 'x'.repeat(1001) },
        ],
      ])('%s: 23514', async (_caso, cambio) => {
        const archivoId = await archivoSql(secciones.s1, PROFESOR)
        await comoApp(
          {
            universidadId: norte,
            rol: 'PROFESOR',
            usuarioId: usuarios[PROFESOR],
          },
          async (q) => {
            await expect(insertar(q, archivoId, cambio)).rejects.toMatchObject({
              code: CHECK,
            })
          },
        )
      })

      it('la descripción puede ser NULL y el título de 100 caracteres cabe', async () => {
        const archivoId = await archivoSql(secciones.s1, PROFESOR)
        await comoApp(
          {
            universidadId: norte,
            rol: 'PROFESOR',
            usuarioId: usuarios[PROFESOR],
          },
          async (q) => {
            await insertar(q, archivoId, {
              titulo: 'x'.repeat(100),
              descripcion: null,
            })
          },
        )
      })
    })
  })

  describe('SELECT: integrantes de cualquier sección del curso y el Director', () => {
    let materialId: string
    beforeAll(async () => {
      materialId = await materialSql()
    })

    const filas = (q: QueryRunner) =>
      q.query('SELECT id FROM material WHERE id = $1', [materialId])

    it.each([
      ['el profesor que lo subió', PROFESOR, 'PROFESOR'],
      ['el co-profesor de la sección', PROFESOR_S1, 'PROFESOR'],
      ['el profesor de otra sección del curso', PROFESOR_S2, 'PROFESOR'],
      ['el ayudante de la sección', AYUDANTE, 'AYUDANTE'],
      ['un alumno de la sección', ALUMNO, 'ALUMNO'],
      ['un alumno de otra sección del curso', ALUMNO_S2, 'ALUMNO'],
    ])('lo ve %s', async (_quien, correo, rol) => {
      await comoApp(
        {
          universidadId: norte,
          rol: rol as Rol,
          usuarioId: usuarios[correo],
        },
        async (q) => {
          expect(await filas(q)).toHaveLength(1)
        },
      )
    })

    it.each([
      ['un profesor de otro curso', PROFESOR_OTRO_CURSO, 'PROFESOR'],
      ['un alumno que no está en el curso', ALUMNO_FUERA, 'ALUMNO'],
      ['el Administrativo', ADMIN_INGENIERIA, 'ADMINISTRATIVO'],
    ])('no lo ve %s: 0 filas', async (_quien, correo, rol) => {
      await comoApp(
        {
          universidadId: norte,
          rol: rol as Rol,
          usuarioId: usuarios[correo],
        },
        async (q) => {
          expect(await filas(q)).toEqual([])
        },
      )
    })

    it('no lo ve un profesor de otra universidad: 0 filas', async () => {
      await comoApp(
        {
          universidadId: sur,
          rol: 'PROFESOR',
          usuarioId: usuarios[PROFESOR_SUR],
        },
        async (q) => {
          expect(await filas(q)).toEqual([])
        },
      )
    })

    it('sin usuario fijado no se ve nada: 0 filas', async () => {
      await comoApp({ universidadId: norte, rol: 'PROFESOR' }, async (q) => {
        expect(await filas(q)).toEqual([])
      })
    })

    it('quien deja la sección deja de verlo', async () => {
      await bd.query(
        `UPDATE ayudante_seccion SET archived_at = now()
          WHERE usuario_id = $1 AND archived_at IS NULL`,
        [usuarios[AYUDANTE]],
      )
      try {
        await comoApp(
          {
            universidadId: norte,
            rol: 'AYUDANTE',
            usuarioId: usuarios[AYUDANTE],
          },
          async (q) => {
            expect(await filas(q)).toEqual([])
          },
        )
      } finally {
        await bd.query(
          `UPDATE ayudante_seccion SET archived_at = NULL
            WHERE usuario_id = $1 AND seccion_id = $2`,
          [usuarios[AYUDANTE], secciones.s1],
        )
      }
    })

    it('el Director lo ve, sea de la universidad que sea', async () => {
      await comoApp({ universidadId: sur, rol: 'DIRECTOR' }, async (q) => {
        expect(await filas(q)).toHaveLength(1)
      })
    })
  })

  describe('UPDATE', () => {
    let materialId: string
    beforeAll(async () => {
      materialId = await materialSql('Para modificar')
    })

    const modificar = (q: QueryRunner, cambio: string) =>
      q.query(
        `WITH cambiado AS (UPDATE material SET ${cambio} WHERE id = $1 RETURNING id)
         SELECT id FROM cambiado`,
        [materialId],
      )

    it('quien lo registró cambia el título, la categoría y lo archiva', async () => {
      await comoApp(
        {
          universidadId: norte,
          rol: 'PROFESOR',
          usuarioId: usuarios[PROFESOR],
        },
        async (q) => {
          expect(
            await modificar(
              q,
              `titulo = 'Nuevo', categoria = 'CODIGO', archived_at = now()`,
            ),
          ).toHaveLength(1)
        },
      )
    })

    it.each([
      ['el curso', () => `curso_id = '${cursoIcc101.replace(/.$/, '0')}'`],
      ['el archivo', () => `archivo_id = gen_random_uuid()`],
      ['quien lo subió', () => `subido_por = '${usuarios[PROFESOR_S1]}'`],
    ])('no cambia %s: 23514', async (_que, cambio) => {
      await comoApp(
        {
          universidadId: norte,
          rol: 'PROFESOR',
          usuarioId: usuarios[PROFESOR],
        },
        async (q) => {
          await expect(modificar(q, cambio())).rejects.toMatchObject({
            code: CHECK,
          })
        },
      )
    })

    it.each([
      ['el ayudante', AYUDANTE, 'AYUDANTE'],
      ['un alumno', ALUMNO, 'ALUMNO'],
      ['el profesor de otro curso', PROFESOR_OTRO_CURSO, 'PROFESOR'],
      // Hoy solo modifica quien lo registró (como archivo): ver la guía.
      ['otro profesor del curso', PROFESOR_S1, 'PROFESOR'],
    ])('%s no lo modifica: 0 filas', async (_quien, correo, rol) => {
      await comoApp(
        {
          universidadId: norte,
          rol: rol as Rol,
          usuarioId: usuarios[correo],
        },
        async (q) => {
          expect(await modificar(q, `titulo = 'Ajeno'`)).toEqual([])
        },
      )
    })
  })

  it('el rol de la API no puede borrar materiales: 42501', async () => {
    const materialId = await materialSql('No se borra')
    await comoApp(
      { universidadId: norte, rol: 'PROFESOR', usuarioId: usuarios[PROFESOR] },
      async (q) => {
        await expect(
          q.query('DELETE FROM material WHERE id = $1', [materialId]),
        ).rejects.toMatchObject({ code: SIN_PERMISO })
      },
    )
  })

  describe('auditoría del superadmin (MT-04)', () => {
    let superadminId: string
    beforeAll(async () => {
      ;({ id: superadminId } = await crearSuperadmin(bd, {
        correo: 'superadmin@cursus.test',
        nombre: 'Superadmin',
        password: 'contraseña-provisoria',
      }))
    })

    it('lo que un superadmin escribe en material queda en superadmin_cambio', async () => {
      const archivoId = await archivoSql(secciones.s1, PROFESOR)
      const q = bd.createQueryRunner()
      await q.startTransaction()
      try {
        // Como dueño de las tablas (la RLS no deja escribir a un superadmin,
        // que entra como Administrativo): el trigger audita igual.
        await q.query(`SELECT set_config('app.superadmin_id', $1, true)`, [
          superadminId,
        ])
        await q.query(`SELECT set_config('app.motivo', 'Corrección', true)`)
        const [{ id }] = await insertarComoDueno(q, archivoId)
        await q.query(
          `UPDATE material SET titulo = 'Corregido' WHERE id = $1`,
          [id],
        )
        const cambios: unknown = await q.query(
          `SELECT universidad_id, superadmin_id, tabla, registro_id, operacion,
                  nuevo->>'titulo' AS titulo, motivo
             FROM superadmin_cambio WHERE tabla = 'material'
            ORDER BY operacion`,
        )
        expect(cambios).toEqual([
          {
            universidad_id: norte,
            superadmin_id: superadminId,
            tabla: 'material',
            registro_id: id,
            operacion: 'INSERT',
            titulo: 'Para auditar',
            motivo: 'Corrección',
          },
          {
            universidad_id: norte,
            superadmin_id: superadminId,
            tabla: 'material',
            registro_id: id,
            operacion: 'UPDATE',
            titulo: 'Corregido',
            motivo: 'Corrección',
          },
        ])
      } finally {
        await q.rollbackTransaction()
        await q.release()
      }
    })

    it('sin superadmin no deja registro', async () => {
      const archivoId = await archivoSql(secciones.s1, PROFESOR)
      const q = bd.createQueryRunner()
      await q.startTransaction()
      try {
        await insertarComoDueno(q, archivoId)
        expect(
          await q.query(
            `SELECT id FROM superadmin_cambio WHERE tabla = 'material'`,
          ),
        ).toEqual([])
      } finally {
        await q.rollbackTransaction()
        await q.release()
      }
    })

    // El superadmin entra como el Administrativo de su facultad: la RLS le
    // niega registrar materiales.
    it('un superadmin, como Administrativo, no registra materiales: 42501', async () => {
      const archivoId = await archivoSql(secciones.s1, PROFESOR)
      await comoApp(
        {
          universidadId: norte,
          rol: 'ADMINISTRATIVO',
          usuarioId: superadminId,
        },
        async (q) => {
          await expect(insertar(q, archivoId)).rejects.toMatchObject({
            code: SIN_PERMISO,
          })
        },
      )
    })

    const insertarComoDueno = (q: QueryRunner, archivoId: string) =>
      q.query(
        `INSERT INTO material (universidad_id, curso_id, archivo_id, categoria, titulo, subido_por)
         VALUES ($1, $2, $3, 'GUIA', 'Para auditar', $4) RETURNING id`,
        [norte, cursoIcc101, archivoId, usuarios[PROFESOR]],
      ) as Promise<{ id: string }[]>
  })
})
