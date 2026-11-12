import type {
  DescargaArchivo,
  EntregaDeAlumno,
  Rol,
  SubidaArchivo,
} from '@cursus/shared'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { DataSource, type QueryRunner } from 'typeorm'
import { vi } from 'vitest'
import { AppModule } from '../../src/app.module.js'
import {
  AlmacenamientoService,
  type ObjetoSubido,
} from '../../src/archivos/almacenamiento.service.js'
import type { RespuestaLogin } from '../../src/auth/auth.controller.js'
import { configurarApp } from '../../src/config/configurar-app.js'
import { opcionesDataSource } from '../../src/database/data-source.js'
import { ejecutarSeed } from '../../src/database/seed.js'

// MAT-10: el profesor y los ayudantes vigentes de la sección listan y
// descargan las entregas de una actividad. Contra PostgreSQL real con RLS;
// S3 se sustituye y se registra qué versión se firma.
const BD_TEST = `${process.env.POSTGRES_TEST_DB ?? 'cursus_test'}_entregas_docentes`
const BD_ORIGINAL = process.env.POSTGRES_DB
const PASSWORD = 'contraseña-de-prueba'
const ALUMNO = 'alumno@norte.cursus.test'
const PROFESOR = 'profesor@norte.cursus.test'
const AYUDANTE = 'ayudante@norte.cursus.test'
const ADMIN = 'administrativo.ingenieria@norte.cursus.test'
const NO_EXISTE = '00000000-0000-4000-8000-000000000000'
const objetos = new Map<string, ObjetoSubido>()
const firmarDescarga = vi.fn(
  (clave: string, nombre: string, version?: string) =>
    Promise.resolve({
      url: `https://s3.test/${clave}?version=${version}&nombre=${nombre}`,
      expiraEn: new Date(Date.now() + 300_000),
    }),
)
const almacenamiento = {
  firmarSubida: (clave: string) =>
    Promise.resolve({
      url: 'https://s3.test/',
      campos: { key: clave },
      expiraEn: new Date(Date.now() + 600_000),
    }),
  objetoSubido: (clave: string) => Promise.resolve(objetos.get(clave) ?? null),
  firmarDescarga,
}
let admin: DataSource
let bd: DataSource
let app: INestApplication<App>
let universidad: string
let seccion: string
let otraSeccion: string
let profesor: string
let coProfesor: string
let coProfesorCorreo: string
let ayudante: string
let ayudanteArchivado: string
let alumno: string
let otroAlumno: string
let otroCorreo: string
let sinEntrega: string
const tokens = new Map<string, string>()
const idDe = async (correo: string) =>
  (
    await bd.query<{ id: string }[]>('SELECT id FROM usuario WHERE correo=$1', [
      correo,
    ])
  )[0].id
const base = (actividad: string, seccionId = seccion) =>
  `/api/espacio/secciones/${seccionId}/actividades/${actividad}`
async function tokenDe(correo: string) {
  if (!tokens.has(correo)) {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ correo, password: PASSWORD })
      .expect(200)
    tokens.set(correo, (res.body as RespuestaLogin).accessToken)
  }
  return tokens.get(correo)!
}
async function get(ruta: string, correo: string, estado: number) {
  const token = await tokenDe(correo)
  const res = await request(app.getHttpServer())
    .get(ruta)
    .set('Authorization', `Bearer ${token}`)
    .expect(estado)
  return res.body as unknown
}
const listar = async (a: string, correo = PROFESOR, estado = 200) =>
  (await get(`${base(a)}/entregas`, correo, estado)) as EntregaDeAlumno[]
const descargar = async (
  a: string,
  entrega: string,
  correo = PROFESOR,
  estado = 200,
  seccionId = seccion,
) =>
  (await get(
    `${base(a, seccionId)}/entregas/${entrega}/descarga`,
    correo,
    estado,
  )) as DescargaArchivo
async function actividad(seccionId = seccion) {
  const [{ id }] = await bd.query<{ id: string }[]>(
    `INSERT INTO actividad (universidad_id,seccion_id,titulo,instrucciones,plazo,creada_por)
    VALUES ($1,$2,'Informe MAT-10','Entregar informe',clock_timestamp()+interval '1 day',$3) RETURNING id`,
    [universidad, seccionId, profesor],
  )
  return id
}
// Sube, confirma y entrega como el alumno, por la API de MAT-01 y MAT-09.
async function entregar(a: string, correo = ALUMNO, nombre = 'Informe.pdf') {
  const token = await tokenDe(correo)
  const res = await request(app.getHttpServer())
    .post(`/api/espacio/secciones/${seccion}/archivos`)
    .set('Authorization', `Bearer ${token}`)
    .send({ nombre, tamano: 100 })
    .expect(201)
  const { archivo } = res.body as SubidaArchivo
  const [{ clave }] = await bd.query<{ clave: string }[]>(
    'SELECT clave FROM archivo WHERE id=$1',
    [archivo.id],
  )
  objetos.set(clave, {
    tamano: 100,
    tipo: 'application/pdf',
    version: `v-${archivo.id}`,
  })
  await request(app.getHttpServer())
    .post(`/api/espacio/secciones/${seccion}/archivos/${archivo.id}/confirmar`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200)
  await request(app.getHttpServer())
    .put(`${base(a)}/mi-entrega`)
    .set('Authorization', `Bearer ${token}`)
    .send({ archivoId: archivo.id })
    .expect(200)
  const [{ id }] = await bd.query<{ id: string }[]>(
    'SELECT id FROM entrega WHERE archivo_id=$1',
    [archivo.id],
  )
  return { entrega: id, archivo: archivo.id, clave }
}
async function comoApp(
  rol: Rol,
  usuario: string,
  probar: (q: QueryRunner) => Promise<void>,
  universidadId = universidad,
) {
  const q = bd.createQueryRunner()
  await q.startTransaction()
  try {
    await q.query('SET LOCAL ROLE cursus_app')
    await q.query(
      `SELECT set_config('app.universidad_id',$1,true),set_config('app.rol',$2,true),set_config('app.usuario_id',$3,true)`,
      [universidadId, rol, usuario],
    )
    await probar(q)
  } finally {
    await q.rollbackTransaction()
    await q.release()
  }
}
async function visibles(q: QueryRunner, a: string): Promise<string[]> {
  const filas = (await q.query(
    'SELECT alumno_id FROM entrega WHERE actividad_id=$1',
    [a],
  )) as { alumno_id: string }[]
  return filas.map((f) => f.alumno_id)
}

beforeAll(async () => {
  admin = await new DataSource(opcionesDataSource()).initialize()
  await admin.query(`DROP DATABASE IF EXISTS "${BD_TEST}" WITH (FORCE)`)
  await admin.query(`CREATE DATABASE "${BD_TEST}"`)
  bd = await new DataSource(opcionesDataSource(BD_TEST)).initialize()
  await bd.runMigrations()
  await ejecutarSeed(bd, PASSWORD)
  profesor = await idDe(PROFESOR)
  ayudante = await idDe(AYUDANTE)
  alumno = await idDe(ALUMNO)
  const filas = await bd.query<
    { id: string; universidad_id: string }[]
  >(`SELECT s.id,s.universidad_id FROM seccion s JOIN curso c ON c.id=s.curso_id
    JOIN universidad u ON u.id=s.universidad_id WHERE c.codigo='ICC101' AND u.dominio_correo='norte.cursus.test' ORDER BY s.numero`)
  seccion = filas[0].id
  otraSeccion = filas[1].id
  universidad = filas[0].universidad_id
  await bd.query('UPDATE seccion SET profesor_id=$2 WHERE id=$1', [
    seccion,
    profesor,
  ])
  const otrosProfesores = await bd.query<{ id: string; correo: string }[]>(
    `SELECT id,correo FROM usuario WHERE universidad_id=$1 AND rol='PROFESOR' AND id<>$2
      AND archived_at IS NULL ORDER BY correo LIMIT 1`,
    [universidad, profesor],
  )
  coProfesor = otrosProfesores[0].id
  coProfesorCorreo = otrosProfesores[0].correo
  // GES-25: un segundo profesor vigente de la sección.
  await bd.query(
    `INSERT INTO seccion_profesor (universidad_id,seccion_id,usuario_id) SELECT $1,$2,$3
      WHERE NOT EXISTS (SELECT 1 FROM seccion_profesor WHERE seccion_id=$2 AND usuario_id=$3 AND archived_at IS NULL)`,
    [universidad, seccion, coProfesor],
  )
  const [otroAyudante] = await bd.query<{ id: string }[]>(
    `SELECT id FROM usuario WHERE universidad_id=$1 AND rol='AYUDANTE' AND id<>$2 ORDER BY correo LIMIT 1`,
    [universidad, ayudante],
  )
  ayudanteArchivado = otroAyudante.id
  await bd.query(
    'DELETE FROM ayudante_seccion WHERE seccion_id=$1 AND usuario_id=$2',
    [seccion, ayudanteArchivado],
  )
  await bd.query(
    `INSERT INTO ayudante_seccion (universidad_id,seccion_id,usuario_id) SELECT $1,$2,$3
      WHERE NOT EXISTS (SELECT 1 FROM ayudante_seccion WHERE seccion_id=$2 AND usuario_id=$3 AND archived_at IS NULL)`,
    [universidad, seccion, ayudante],
  )
  await bd.query(
    `INSERT INTO ayudante_seccion (universidad_id,seccion_id,usuario_id,archived_at)
      VALUES ($1,$2,$3,now())`,
    [universidad, seccion, ayudanteArchivado],
  )
  const alumnos = await bd.query<{ id: string; correo: string }[]>(
    `SELECT id,correo FROM usuario WHERE universidad_id=$1 AND rol='ALUMNO' AND id<>$2
      AND archived_at IS NULL ORDER BY correo LIMIT 2`,
    [universidad, alumno],
  )
  otroAlumno = alumnos[0].id
  otroCorreo = alumnos[0].correo
  sinEntrega = alumnos[1].id
  // Solo estos tres alumnos quedan inscritos en la sección.
  await bd.query(
    'UPDATE inscripcion SET archived_at=now(),archivada_por=$2 WHERE seccion_id=$1 AND archived_at IS NULL',
    [seccion, await idDe(ADMIN)],
  )
  for (const u of [alumno, otroAlumno, sinEntrega]) {
    await bd.query(
      'INSERT INTO inscripcion (universidad_id,seccion_id,usuario_id) VALUES ($1,$2,$3)',
      [universidad, seccion, u],
    )
  }
  process.env.POSTGRES_DB = BD_TEST
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(AlmacenamientoService)
    .useValue(almacenamiento)
    .compile()
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

describe('MAT-10: listado de entregas', () => {
  it('lista a todos los inscritos vigentes, con su última entrega o sin entrega', async () => {
    const a = await actividad()
    await entregar(a, ALUMNO, 'Primera.pdf')
    const ultima = await entregar(a, ALUMNO, 'Segunda.pdf')
    const otra = await entregar(a, otroCorreo)

    const lista = await listar(a)

    expect(lista.map((f) => f.alumno.id).sort()).toEqual(
      [alumno, otroAlumno, sinEntrega].sort(),
    )
    const nombres = lista.map((f) => f.alumno.nombre)
    expect(nombres).toEqual(
      [...nombres].sort((x, y) => x.localeCompare(y, 'es-CL')),
    )
    const de = (id: string) => lista.find((f) => f.alumno.id === id)!
    expect(de(alumno).entrega).toMatchObject({
      id: ultima.entrega,
      versiones: 2,
      archivo: { id: ultima.archivo, nombre: 'Segunda.pdf' },
    })
    expect(de(alumno).entrega!.entregadaEn).toMatch(/Z$/)
    expect(de(otroAlumno).entrega).toMatchObject({
      id: otra.entrega,
      versiones: 1,
    })
    expect(de(sinEntrega).entrega).toBeNull()
  })

  it('el co-profesor y el ayudante vigente ven lo mismo que el profesor', async () => {
    const a = await actividad()
    const e = await entregar(a)
    for (const correo of [coProfesorCorreo, AYUDANTE]) {
      const lista = await listar(a, correo)
      expect(lista.find((f) => f.alumno.id === alumno)?.entrega?.id).toBe(
        e.entrega,
      )
    }
  })

  it('sin entregas, todos aparecen sin entrega', async () => {
    const a = await actividad()
    const lista = await listar(a)
    expect(lista).toHaveLength(3)
    expect(lista.every((f) => f.entrega === null)).toBe(true)
  })

  it('el alumno, el Director, el Administrativo y otra universidad no listan', async () => {
    const a = await actividad()
    await entregar(a)
    await listar(a, ALUMNO, 403)
    await listar(a, ADMIN, 403)
    await listar(a, 'director@norte.cursus.test', 403)
    await listar(a, 'profesor@sur.cursus.test', 404)
  })

  it('un profesor de otra sección no lista ni descarga', async () => {
    const a = await actividad()
    const e = await entregar(a)
    await bd.query(
      'UPDATE seccion_profesor SET archived_at=now() WHERE seccion_id=$1 AND usuario_id=$2 AND archived_at IS NULL',
      [seccion, coProfesor],
    )
    await bd.query(
      `INSERT INTO seccion_profesor (universidad_id,seccion_id,usuario_id) SELECT $1,$2,$3
        WHERE NOT EXISTS (SELECT 1 FROM seccion_profesor WHERE seccion_id=$2 AND usuario_id=$3 AND archived_at IS NULL)`,
      [universidad, otraSeccion, coProfesor],
    )
    try {
      await listar(a, coProfesorCorreo, 403)
      await descargar(a, e.entrega, coProfesorCorreo, 403)
      // Por la otra sección, donde sí es profesor, la actividad no existe.
      await descargar(a, e.entrega, coProfesorCorreo, 404, otraSeccion)
    } finally {
      await bd.query(
        'UPDATE seccion_profesor SET archived_at=now() WHERE seccion_id=$1 AND usuario_id=$2 AND archived_at IS NULL',
        [otraSeccion, coProfesor],
      )
      await bd.query(
        'INSERT INTO seccion_profesor (universidad_id,seccion_id,usuario_id) VALUES ($1,$2,$3)',
        [universidad, seccion, coProfesor],
      )
    }
  })

  it('una actividad de otra sección o inexistente responde 404', async () => {
    const otra = await actividad(otraSeccion)
    await listar(otra, PROFESOR, 404)
    await listar(NO_EXISTE, PROFESOR, 404)
  })
})

describe('MAT-10: descarga', () => {
  it('firma la versión acreditada de esa entrega, no la última del objeto', async () => {
    const a = await actividad()
    const e = await entregar(a)
    // Otra subida con una firma vigente cambia la última versión del objeto,
    // pero no la acreditada.
    objetos.set(e.clave, {
      tamano: 100,
      tipo: 'application/pdf',
      version: 'v-sobrescrita',
    })
    firmarDescarga.mockClear()

    const descarga = await descargar(a, e.entrega)

    expect(firmarDescarga).toHaveBeenCalledWith(
      e.clave,
      'Informe.pdf',
      `v-${e.archivo}`,
    )
    expect(descarga.url).toContain(`version=v-${e.archivo}`)
    expect(new Date(descarga.expiraEn).getTime()).toBeGreaterThan(Date.now())
  })

  it('cada versión entregada se descarga por separado', async () => {
    const a = await actividad()
    const primera = await entregar(a, ALUMNO, 'Primera.pdf')
    await entregar(a, ALUMNO, 'Segunda.pdf')
    firmarDescarga.mockClear()
    await descargar(a, primera.entrega, AYUDANTE)
    expect(firmarDescarga).toHaveBeenCalledWith(
      primera.clave,
      'Primera.pdf',
      `v-${primera.archivo}`,
    )
  })

  it('el alumno, otra universidad, otra actividad y una entrega inexistente no descargan', async () => {
    const a = await actividad()
    const otraActividad = await actividad()
    const e = await entregar(a)
    firmarDescarga.mockClear()
    await descargar(a, e.entrega, ALUMNO, 403)
    await descargar(a, e.entrega, 'profesor@sur.cursus.test', 404)
    await descargar(otraActividad, e.entrega, PROFESOR, 404)
    await descargar(a, NO_EXISTE, PROFESOR, 404)
    expect(firmarDescarga).not.toHaveBeenCalled()
  })
})

describe('MAT-10: RLS de entrega para el equipo docente', () => {
  let a: string
  beforeAll(async () => {
    a = await actividad()
    await entregar(a)
    await entregar(a, otroCorreo)
  })

  it.each<[string, Rol, () => string]>([
    ['el profesor', 'PROFESOR', () => profesor],
    ['el co-profesor', 'PROFESOR', () => coProfesor],
    ['el ayudante vigente', 'AYUDANTE', () => ayudante],
  ])('%s lee todas las entregas de la sección', async (_, rol, usuario) => {
    await comoApp(rol, usuario(), async (q) => {
      expect((await visibles(q, a)).sort()).toEqual([alumno, otroAlumno].sort())
    })
  })

  it('un ayudante archivado no lee', async () => {
    await comoApp('AYUDANTE', ayudanteArchivado, async (q) => {
      expect(await visibles(q, a)).toEqual([])
    })
  })

  it('el profesor con rol de sesión de ayudante, o sin usuario fijado, no lee', async () => {
    await comoApp('AYUDANTE', profesor, async (q) => {
      expect(await visibles(q, a)).toEqual([])
    })
    await comoApp('PROFESOR', '', async (q) => {
      expect(await visibles(q, a)).toEqual([])
    })
  })

  it('un profesor de otra sección no lee', async () => {
    const [{ id }] = await bd.query<{ id: string }[]>(
      `SELECT u.id FROM usuario u WHERE u.universidad_id=$1 AND u.rol='PROFESOR'
        AND NOT es_profesor_de_seccion($2,u.id) ORDER BY u.correo LIMIT 1`,
      [universidad, seccion],
    )
    await comoApp('PROFESOR', id, async (q) => {
      expect(await visibles(q, a)).toEqual([])
    })
  })

  it('el alumno sigue viendo solo lo suyo', async () => {
    await comoApp('ALUMNO', alumno, async (q) => {
      expect(await visibles(q, a)).toEqual([alumno])
    })
  })

  it('otra universidad no lee', async () => {
    const [{ id: otra }] = await bd.query<{ id: string }[]>(
      `SELECT id FROM universidad WHERE dominio_correo='sur.cursus.test'`,
    )
    await comoApp(
      'PROFESOR',
      profesor,
      async (q) => {
        expect(await visibles(q, a)).toEqual([])
      },
      otra,
    )
  })
})
