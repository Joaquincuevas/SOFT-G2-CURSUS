import type { MiEntregaActividad, Rol, SubidaArchivo } from '@cursus/shared'
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

const BD_TEST = `${process.env.POSTGRES_TEST_DB ?? 'cursus_test'}_entregas`
const BD_ORIGINAL = process.env.POSTGRES_DB
const PASSWORD = 'contraseña-de-prueba'
const ALUMNO = 'alumno@norte.cursus.test'
const PROFESOR = 'profesor@norte.cursus.test'
const ADMIN = 'administrativo.ingenieria@norte.cursus.test'
const NO_EXISTE = '00000000-0000-4000-8000-000000000000'
const objetos = new Map<string, ObjetoSubido>()
const almacenamiento = {
  firmarSubida: (clave: string) =>
    Promise.resolve({
      url: 'https://s3.test/',
      campos: { key: clave },
      expiraEn: new Date(Date.now() + 600_000),
    }),
  objetoSubido: (clave: string) => Promise.resolve(objetos.get(clave) ?? null),
}
let admin: DataSource
let bd: DataSource
let app: INestApplication<App>
let universidad: string
let seccion: string
let otraSeccion: string
let profesor: string
let alumno: string
let otroAlumno: string
let otroCorreo: string
const tokens = new Map<string, string>()
const idDe = async (correo: string) =>
  (
    await bd.query<{ id: string }[]>('SELECT id FROM usuario WHERE correo=$1', [
      correo,
    ])
  )[0].id
const ruta = (actividad: string, seccionId = seccion) =>
  `/api/espacio/secciones/${seccionId}/actividades/${actividad}/mi-entrega`
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
async function actividad(
  plazo = "clock_timestamp()+interval '1 day'",
  seccionId = seccion,
) {
  const [{ id }] = await bd.query<{ id: string }[]>(
    `INSERT INTO actividad (universidad_id,seccion_id,titulo,instrucciones,plazo,creada_por)
    VALUES ($1,$2,'Informe MAT-09','Entregar informe',${plazo},$3) RETURNING id`,
    [universidad, seccionId, profesor],
  )
  return id
}
async function subir(correo = ALUMNO, seccionId = seccion, confirmar = true) {
  const token = await tokenDe(correo)
  const res = await request(app.getHttpServer())
    .post(`/api/espacio/secciones/${seccionId}/archivos`)
    .set('Authorization', `Bearer ${token}`)
    .send({ nombre: 'Informe final.pdf', tamano: 100 })
    .expect(201)
  const { archivo } = res.body as SubidaArchivo
  const [{ clave }] = await bd.query<{ clave: string }[]>(
    'SELECT clave FROM archivo WHERE id=$1',
    [archivo.id],
  )
  objetos.set(clave, {
    tamano: 100,
    tipo: 'application/pdf',
    version: `version-${archivo.id}`,
  })
  if (confirmar)
    await request(app.getHttpServer())
      .post(
        `/api/espacio/secciones/${seccionId}/archivos/${archivo.id}/confirmar`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
  return { id: archivo.id, clave }
}
async function entregar(
  a: string,
  archivoId: string,
  estado = 200,
  correo = ALUMNO,
  seccionId = seccion,
) {
  const token = await tokenDe(correo)
  const res = await request(app.getHttpServer())
    .put(ruta(a, seccionId))
    .set('Authorization', `Bearer ${token}`)
    .send({ archivoId })
    .expect(estado)
  return res.body as MiEntregaActividad
}
async function leer(
  a: string,
  correo = ALUMNO,
  estado = 200,
  seccionId = seccion,
) {
  const token = await tokenDe(correo)
  const res = await request(app.getHttpServer())
    .get(ruta(a, seccionId))
    .set('Authorization', `Bearer ${token}`)
    .expect(estado)
  return res.body as MiEntregaActividad
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

beforeAll(async () => {
  admin = await new DataSource(opcionesDataSource()).initialize()
  await admin.query(`DROP DATABASE IF EXISTS "${BD_TEST}" WITH (FORCE)`)
  await admin.query(`CREATE DATABASE "${BD_TEST}"`)
  bd = await new DataSource(opcionesDataSource(BD_TEST)).initialize()
  await bd.runMigrations()
  await ejecutarSeed(bd, PASSWORD)
  profesor = await idDe(PROFESOR)
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
  const [otro] = await bd.query<{ id: string; correo: string }[]>(
    `SELECT id,correo FROM usuario WHERE universidad_id=$1 AND rol='ALUMNO' AND id<>$2 ORDER BY correo LIMIT 1`,
    [universidad, alumno],
  )
  otroAlumno = otro.id
  otroCorreo = otro.correo
  for (const [s, u] of [
    [seccion, alumno],
    [seccion, otroAlumno],
    [otraSeccion, alumno],
  ]) {
    await bd.query(
      `INSERT INTO inscripcion (universidad_id,seccion_id,usuario_id) SELECT $1,$2,$3
      WHERE NOT EXISTS (SELECT 1 FROM inscripcion WHERE seccion_id=$2 AND usuario_id=$3 AND archived_at IS NULL)`,
      [universidad, s, u],
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

describe('MAT-09: entrega y reemplazo del informe', () => {
  it('confirma archivo, versión exacta y fecha del servidor; releer conserva la confirmación', async () => {
    const a = await actividad()
    const f = await subir()
    expect(await leer(a)).toEqual({ entrega: null, cerrada: false })
    const [{ ahora }] = await bd.query<{ ahora: Date }[]>(
      'SELECT clock_timestamp() AS ahora',
    )
    const resultado = await entregar(a, f.id)
    expect(resultado).toMatchObject({
      cerrada: false,
      entrega: {
        id: expect.any(String) as string,
        archivo: { id: f.id, nombre: 'Informe final.pdf', tamano: 100 },
        entregadaEn: expect.any(String) as string,
      },
    })
    expect(
      new Date(resultado.entrega!.entregadaEn).getTime(),
    ).toBeGreaterThanOrEqual(ahora.getTime())
    expect(await leer(a)).toEqual(resultado)
    const [fila] = await bd.query<{ version_objeto: string }[]>(
      'SELECT version_objeto FROM entrega WHERE id=$1',
      [resultado.entrega!.id],
    )
    expect(fila.version_objeto).toBe(`version-${f.id}`)
    objetos.set(f.clave, {
      tamano: 100,
      tipo: 'application/pdf',
      version: 'sobrescritura-posterior',
    })
    expect(await leer(a)).toEqual(resultado)
    expect(JSON.stringify(resultado)).not.toMatch(
      /version_objeto|alumno_id|clave/,
    )
  })
  it('reemplaza antes del plazo conservando la entrega anterior y sin duplicar reintentos', async () => {
    const a = await actividad()
    const f1 = await subir()
    const f2 = await subir()
    const primera = await entregar(a, f1.id)
    const segunda = await entregar(a, f2.id)
    expect(segunda.entrega!.id).not.toBe(primera.entrega!.id)
    expect((await leer(a)).entrega!.archivo.id).toBe(f2.id)
    expect(await entregar(a, f2.id)).toEqual(segunda)
    expect(await entregar(a, f1.id)).toEqual(segunda)
    const filas = await bd.query<{ archivo_id: string }[]>(
      'SELECT archivo_id FROM entrega WHERE actividad_id=$1 ORDER BY entregada_at',
      [a],
    )
    expect(filas.map((f) => f.archivo_id)).toEqual([f1.id, f2.id])
  })
  it('dos confirmaciones simultáneas del mismo archivo dejan una sola entrega', async () => {
    const a = await actividad()
    const f = await subir()
    const respuestas = await Promise.all([entregar(a, f.id), entregar(a, f.id)])
    expect(respuestas[0]).toEqual(respuestas[1])
    expect(
      await bd.query('SELECT id FROM entrega WHERE actividad_id=$1', [a]),
    ).toHaveLength(1)
  })
  it('dos reemplazos simultáneos conservan ambas versiones y una última entrega inequívoca', async () => {
    const a = await actividad()
    const f1 = await subir()
    const f2 = await subir()
    await Promise.all([entregar(a, f1.id), entregar(a, f2.id)])
    const filas = await bd.query<{ id: string }[]>(
      'SELECT id FROM entrega WHERE actividad_id=$1 ORDER BY entregada_at DESC,id DESC',
      [a],
    )
    expect(filas).toHaveLength(2)
    expect((await leer(a)).entrega!.id).toBe(filas[0].id)
  })
  it('no acepta entregas ni reemplazos tras el plazo; conserva la confirmación y admite el reintento ya aceptado', async () => {
    const a = await actividad()
    const f = await subir()
    const aceptada = await entregar(a, f.id)
    const nueva = await subir()
    await bd.query(
      "UPDATE actividad SET plazo=clock_timestamp()-interval '1 second' WHERE id=$1",
      [a],
    )
    await entregar(a, nueva.id, 409)
    expect(await leer(a)).toEqual({ ...aceptada, cerrada: true })
    expect(await entregar(a, f.id)).toEqual({ ...aceptada, cerrada: true })
    const cerrada = await actividad("clock_timestamp()-interval '1 second'")
    await entregar(cerrada, nueva.id, 409)
    expect((await leer(cerrada)).entrega).toBeNull()
  })
  it('rechaza si vence mientras se verifica el archivo, aunque la transacción haya empezado antes', async () => {
    const f = await subir()
    const a = await actividad("clock_timestamp()+interval '1 second'")
    const espia = vi
      .spyOn(almacenamiento, 'objetoSubido')
      .mockImplementationOnce(async (clave) => {
        await bd.query('SELECT pg_sleep(1.1)')
        return objetos.get(clave) ?? null
      })
    try {
      await entregar(a, f.id, 409)
    } finally {
      espia.mockRestore()
    }
    expect((await leer(a)).entrega).toBeNull()
  })
  it('un fallo de almacenamiento conserva la entrega anterior sin crear otra', async () => {
    const a = await actividad()
    const f = await subir()
    const primera = await entregar(a, f.id)
    const nueva = await subir()
    const espia = vi
      .spyOn(almacenamiento, 'objetoSubido')
      .mockRejectedValueOnce(new Error('Fallo simulado'))
    try {
      await entregar(a, nueva.id, 500)
    } finally {
      espia.mockRestore()
    }
    expect(await leer(a)).toEqual(primera)
  })
  it.each([
    'sin objeto',
    'tamaño distinto',
    'tipo distinto',
    'sin versión',
    'versión null',
  ])('rechaza un archivo %s sin acreditar una entrega', async (caso) => {
    const a = await actividad()
    const f = await subir()
    const original = objetos.get(f.clave)!
    if (caso === 'sin objeto') objetos.delete(f.clave)
    else
      objetos.set(f.clave, {
        ...original,
        ...(caso === 'tamaño distinto'
          ? { tamano: 1 }
          : caso === 'tipo distinto'
            ? { tipo: 'text/plain' }
            : caso === 'sin versión'
              ? { version: undefined }
              : { version: 'null' }),
      })
    await entregar(
      a,
      f.id,
      caso.startsWith('sin versión') || caso === 'versión null' ? 503 : 409,
    )
    expect((await leer(a)).entrega).toBeNull()
  })
  it('rechaza un archivo sin confirmar, ajeno, de otra sección, archivado o inexistente', async () => {
    const a = await actividad()
    const sinConfirmar = await subir(ALUMNO, seccion, false)
    const ajeno = await subir(otroCorreo)
    const otra = await subir(ALUMNO, otraSeccion)
    const archivado = await subir()
    await bd.query('UPDATE archivo SET archived_at=now() WHERE id=$1', [
      archivado.id,
    ])
    for (const id of [
      sinConfirmar.id,
      ajeno.id,
      otra.id,
      archivado.id,
      NO_EXISTE,
    ])
      await entregar(a, id, 400)
    expect((await leer(a)).entrega).toBeNull()
  })
  it('cada alumno ve solo su entrega y un usuario de otra universidad no entra', async () => {
    const a = await actividad()
    const f = await subir()
    const ajeno = await subir(otroCorreo)
    const propia = await entregar(a, f.id)
    const otra = await entregar(a, ajeno.id, 200, otroCorreo)
    expect(await leer(a)).toEqual(propia)
    expect(await leer(a, otroCorreo)).toEqual(otra)
    await leer(a, 'alumno@sur.cursus.test', 404)
    await comoApp('ALUMNO', alumno, async (q) => {
      const filas = await q.query<{ id: string }[]>(
        'SELECT id FROM entrega WHERE actividad_id=$1',
        [a],
      )
      expect(filas).toEqual([{ id: propia.entrega!.id }])
    })
    await comoApp('ALUMNO', '', async (q) => {
      expect(await q.query('SELECT id FROM entrega')).toEqual([])
    })
  })
  it.each<Rol>(['PROFESOR', 'AYUDANTE', 'ADMINISTRATIVO', 'DIRECTOR'])(
    '%s no usa los endpoints de entrega propia',
    async (rol) => {
      const correos = {
        PROFESOR,
        AYUDANTE: 'ayudante@norte.cursus.test',
        ADMINISTRATIVO: ADMIN,
        DIRECTOR: 'director@norte.cursus.test',
      } as Record<string, string>
      const a = await actividad()
      await leer(a, correos[rol], 403)
      await entregar(a, NO_EXISTE, 403, correos[rol])
    },
  )
  it('exige inscripción vigente y actividad de la sección', async () => {
    const a = await actividad()
    const f = await subir()
    await leer(a, ALUMNO, 404, otraSeccion)
    await entregar(a, f.id, 404, ALUMNO, otraSeccion)
    await bd.query(
      'UPDATE inscripcion SET archived_at=now(),archivada_por=$3 WHERE seccion_id=$1 AND usuario_id=$2 AND archived_at IS NULL',
      [seccion, alumno, await idDe(ADMIN)],
    )
    try {
      await leer(a, ALUMNO, 403)
      await entregar(a, f.id, 403)
    } finally {
      await bd.query(
        'UPDATE inscripcion SET archived_at=NULL,archivada_por=NULL WHERE seccion_id=$1 AND usuario_id=$2',
        [seccion, alumno],
      )
    }
  })
  it.each(['actividad', 'seccion', 'curso'])(
    'no acepta una %s archivada',
    async (tabla) => {
      const a = await actividad()
      const f = await subir()
      const [{ id }] = await bd.query<{ id: string }[]>(
        `SELECT ${tabla === 'actividad' ? 'a.id' : tabla === 'seccion' ? 's.id' : 'c.id'} FROM actividad a JOIN seccion s ON s.id=a.seccion_id JOIN curso c ON c.id=s.curso_id WHERE a.id=$1`,
        [a],
      )
      await bd.query(`UPDATE ${tabla} SET archived_at=now() WHERE id=$1`, [id])
      try {
        await entregar(a, f.id, 404)
      } finally {
        await bd.query(`UPDATE ${tabla} SET archived_at=NULL WHERE id=$1`, [id])
      }
    },
  )
  it('la base exige archivo propio confirmado, plazo real y filas de solo adición', async () => {
    const a = await actividad()
    const f = await subir()
    const ajeno = await subir(otroCorreo)
    await comoApp('ALUMNO', alumno, async (q) => {
      await expect(
        q.query(
          `INSERT INTO entrega (universidad_id,actividad_id,alumno_id,archivo_id,version_objeto) VALUES ($1,$2,$3,$4,'v1')`,
          [universidad, a, alumno, ajeno.id],
        ),
      ).rejects.toMatchObject({
        driverError: { constraint: 'ck_entrega_archivo' },
      })
    })
    const cerrada = await actividad("clock_timestamp()-interval '1 second'")
    await comoApp('ALUMNO', alumno, async (q) => {
      await expect(
        q.query(
          `INSERT INTO entrega (universidad_id,actividad_id,alumno_id,archivo_id,version_objeto,entregada_at) VALUES ($1,$2,$3,$4,'v1','2000-01-01')`,
          [universidad, cerrada, alumno, f.id],
        ),
      ).rejects.toMatchObject({
        driverError: { constraint: 'ck_entrega_plazo' },
      })
    })
    await entregar(a, f.id)
    for (const sql of [
      'UPDATE entrega SET entregada_at=now()',
      'DELETE FROM entrega',
    ]) {
      await comoApp('ALUMNO', alumno, async (q) => {
        await expect(q.query(sql)).rejects.toMatchObject({
          driverError: { code: '42501' },
        })
      })
    }
  })
})
