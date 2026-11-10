import type { NotasEvaluacion, RecorregirNota, Rol } from '@cursus/shared'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { DataSource, type QueryRunner } from 'typeorm'
import { vi } from 'vitest'
import { AppModule } from '../../src/app.module.js'
import type { RespuestaLogin } from '../../src/auth/auth.controller.js'
import { configurarApp } from '../../src/config/configurar-app.js'
import { ROL_APP } from '../../src/database/base-de-datos.service.js'
import { opcionesDataSource } from '../../src/database/data-source.js'
import { ejecutarSeed } from '../../src/database/seed.js'
import { AuditoriaNotasService } from '../../src/notas/auditoria-notas.service.js'

const BD_TEST = `${process.env.POSTGRES_TEST_DB ?? 'cursus_test'}_recorreccion`
const BD_ORIGINAL = process.env.POSTGRES_DB
const PASSWORD = 'contraseña-de-prueba'
const PROFESOR = 'profesor@norte.cursus.test'
const AYUDANTE = 'ayudante@norte.cursus.test'
const ALUMNO = 'alumno@norte.cursus.test'
const NO_EXISTE = '00000000-0000-4000-8000-000000000000'
let admin: DataSource
let bd: DataSource
let app: INestApplication<App>
const tokens = new Map<string, string>()
let universidad: string
let seccion: string
let otraSeccion: string
let profesor: string
let alumno: string
let ayudante: string
let otroProfesor: string

const idDe = async (correo: string) =>
  (
    await bd.query<{ id: string }[]>('SELECT id FROM usuario WHERE correo=$1', [
      correo,
    ])
  )[0].id

async function tokenDe(correo: string) {
  if (!tokens.has(correo)) {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ correo, password: PASSWORD })
      .expect(200)
    tokens.set(correo, (res.body as RespuestaLogin).accessToken)
  }
  return tokens.get(correo) as string
}
const ruta = (evaluacion: string, alumnoId = alumno, seccionId = seccion) =>
  `/api/espacio/secciones/${seccionId}/evaluaciones/${evaluacion}/notas/${alumnoId}/recorreccion`
const cambio = (datos: Partial<RecorregirNota> = {}): RecorregirNota => ({
  notaAnterior: 5.5,
  notaNueva: 6.2,
  motivo: 'Se reconoció el procedimiento de la pregunta 3.',
  ...datos,
})
async function corregir(
  evaluacion: string,
  datos: unknown = cambio(),
  correo = PROFESOR,
  alumnoId = alumno,
  seccionId = seccion,
) {
  const token = await tokenDe(correo)
  return request(app.getHttpServer())
    .post(ruta(evaluacion, alumnoId, seccionId))
    .set('Authorization', `Bearer ${token}`)
    .send(datos as object)
}
async function escenario(estado = 'PUBLICADA', valor = 5.5) {
  const [{ id }] = await bd.query<{ id: string }[]>(
    `INSERT INTO evaluacion (universidad_id,seccion_id,nombre,fecha,ponderacion,creada_por)
     VALUES ($1,$2,'Recorrección de prueba',CURRENT_DATE,20,$3) RETURNING id`,
    [universidad, seccion, profesor],
  )
  await bd.query(
    `INSERT INTO nota (universidad_id,evaluacion_id,alumno_id,valor,estado,propuesta_por)
    VALUES ($1,$2,$3,$4,$5,$6)`,
    [universidad, id, alumno, valor, estado, ayudante],
  )
  await bd.query(
    `INSERT INTO revision_notas (universidad_id,evaluacion_id,estado,actualizado_por)
    VALUES ($1,$2,$3,$4)`,
    [
      universidad,
      id,
      estado === 'PUBLICADA' ? 'APROBADA' : 'BORRADOR',
      profesor,
    ],
  )
  return id
}
const notaDe = async (evaluacion: string) =>
  (
    await bd.query<
      {
        valor: string
        estado: string
        recorreccion_id: string | null
      }[]
    >('SELECT valor,estado,recorreccion_id FROM nota WHERE evaluacion_id=$1', [
      evaluacion,
    ])
  )[0]
const eventosDe = (evaluacion: string) =>
  bd.query<
    {
      id: string
      nota_anterior: string
      nota_nueva: string
      motivo: string
      fecha: Date
      responsable_id: string
    }[]
  >(
    `SELECT id,nota_anterior,nota_nueva,motivo,fecha,responsable_id
  FROM nota_cambio WHERE evaluacion_id=$1 AND tipo='RECORRECCION' ORDER BY fecha,id`,
    [evaluacion],
  )

async function comoApp(
  rol: Rol,
  actor: string,
  probar: (q: QueryRunner) => Promise<void>,
) {
  const q = bd.createQueryRunner()
  await q.startTransaction()
  try {
    await q.query(`SET LOCAL ROLE ${ROL_APP}`)
    await q.query(
      `SELECT set_config('app.universidad_id',$1,true),set_config('app.rol',$2,true),set_config('app.usuario_id',$3,true)`,
      [universidad, rol, actor],
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
  ayudante = await idDe(AYUDANTE)
  const secciones = await bd.query<{ id: string; universidad_id: string }[]>(
    `SELECT s.id,s.universidad_id FROM seccion s JOIN curso c ON c.id=s.curso_id
      JOIN universidad u ON u.id=s.universidad_id
      WHERE c.codigo='ICC101' AND u.dominio_correo='norte.cursus.test' ORDER BY s.numero`,
  )
  seccion = secciones[0].id
  universidad = secciones[0].universidad_id
  otraSeccion = secciones[1].id
  await bd.query('UPDATE seccion SET profesor_id=$2 WHERE id=$1', [
    seccion,
    profesor,
  ])
  await bd.query(
    `INSERT INTO inscripcion (universidad_id,seccion_id,usuario_id)
    SELECT $1,$2,$3 WHERE NOT EXISTS (SELECT 1 FROM inscripcion
      WHERE seccion_id=$2 AND usuario_id=$3 AND archived_at IS NULL)`,
    [universidad, seccion, alumno],
  )
  const [otro] = await bd.query<{ correo: string }[]>(
    `SELECT correo FROM usuario WHERE universidad_id=$1 AND rol='PROFESOR' AND id<>$2 ORDER BY correo LIMIT 1`,
    [universidad, profesor],
  )
  otroProfesor = otro.correo
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

describe('NOT-15: recorrección de notas publicadas', () => {
  it('conserva ambas notas, el motivo, la fecha y el profesor, y la respuesta marca la nota nueva', async () => {
    const e = await escenario()
    const [{ ahora }] = await bd.query<{ ahora: Date }[]>(
      'SELECT clock_timestamp() AS ahora',
    )
    const motivo = '  Se reconoció el procedimiento.\nLa suma es correcta.  '
    const res = await corregir(e, cambio({ motivo }))
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    expect(
      (res.body as NotasEvaluacion).alumnos.find((a) => a.id === alumno),
    ).toMatchObject({ nota: 6.2, estado: 'PUBLICADA', recorregida: true })
    const eventos = await eventosDe(e)
    expect(eventos).toHaveLength(1)
    expect(eventos[0]).toMatchObject({
      nota_anterior: '5.5',
      nota_nueva: '6.2',
      motivo: motivo.trim(),
      responsable_id: profesor,
    })
    expect(eventos[0].fecha.getTime()).toBeGreaterThanOrEqual(ahora.getTime())
    expect(await notaDe(e)).toEqual({
      valor: '6.2',
      estado: 'PUBLICADA',
      recorreccion_id: eventos[0].id,
    })
    await corregir(e, cambio({ notaAnterior: 6.2, notaNueva: 6.5 })).then((r) =>
      expect(r.status).toBe(200),
    )
    expect(
      (await eventosDe(e)).map((v) => [v.nota_anterior, v.nota_nueva]),
    ).toEqual([
      ['5.5', '6.2'],
      ['6.2', '6.5'],
    ])
  })

  it.each(['', '  ', '\n\t', 'x'.repeat(501), '\u0000', null, 8])(
    'rechaza el motivo inválido %j sin tocar la nota ni la auditoría',
    async (motivo) => {
      const e = await escenario()
      expect((await corregir(e, { ...cambio(), motivo })).status).toBe(400)
      expect((await notaDe(e)).valor).toBe('5.5')
      expect(await eventosDe(e)).toEqual([])
    },
  )
  it('acepta 500 caracteres Unicode y rechaza 501', async () => {
    const e = await escenario()
    expect(
      (await corregir(e, cambio({ motivo: '😀'.repeat(500) }))).status,
    ).toBe(200)
    expect(
      (
        await corregir(
          e,
          cambio({
            notaAnterior: 6.2,
            notaNueva: 6.5,
            motivo: '😀'.repeat(501),
          }),
        )
      ).status,
    ).toBe(400)
    expect(await eventosDe(e)).toHaveLength(1)
  })
  it.each([0.9, 7.1, 5.55, '6,2', null])(
    'rechaza la nota inválida %j',
    async (notaNueva) => {
      const e = await escenario()
      expect((await corregir(e, { ...cambio(), notaNueva })).status).toBe(400)
      expect(await eventosDe(e)).toEqual([])
    },
  )
  it('no crea un cambio si se pide la misma nota', async () => {
    const e = await escenario()
    expect((await corregir(e, cambio({ notaNueva: 5.5 }))).status).toBe(400)
    expect(await eventosDe(e)).toEqual([])
  })
  it.each([1, 7])('acepta el extremo %s de la escala', async (notaNueva) => {
    const e = await escenario()
    expect((await corregir(e, cambio({ notaNueva }))).status).toBe(200)
    expect(Number((await notaDe(e)).valor)).toBe(notaNueva)
  })
  it('una segunda pestaña y un reintento no sobrescriben la recorrección previa', async () => {
    const e = await escenario()
    await tokenDe(PROFESOR)
    const respuestas = await Promise.all([corregir(e), corregir(e)])
    expect(respuestas.map((r) => r.status).sort()).toEqual([200, 409])
    const conflicto = respuestas.find((r) => r.status === 409)
    expect(conflicto?.body).toMatchObject({ notaActual: 6.2 })
    expect(await eventosDe(e)).toHaveLength(1)
  })
  it('revierte el valor y la marca si falla la escritura de auditoría', async () => {
    const e = await escenario()
    const espia = vi
      .spyOn(app.get(AuditoriaNotasService), 'registrar')
      .mockRejectedValueOnce(new Error('Fallo de prueba'))
    try {
      expect((await corregir(e)).status).toBe(500)
    } finally {
      espia.mockRestore()
    }
    expect(await notaDe(e)).toEqual({
      valor: '5.5',
      estado: 'PUBLICADA',
      recorreccion_id: null,
    })
    expect(await eventosDe(e)).toEqual([])
  })
  it('rechaza una nota aún propuesta', async () => {
    const e = await escenario('PROPUESTA')
    expect((await corregir(e)).status).toBe(409)
    expect(await eventosDe(e)).toEqual([])
  })
  it('revierte el evento insertado si el UPDATE de la nota no modifica ninguna fila', async () => {
    const e = await escenario()
    await bd.query(`CREATE FUNCTION test_omitir_recorreccion() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$`)
    await bd.query(`CREATE TRIGGER tg_test_omitir_recorreccion
      BEFORE UPDATE ON nota FOR EACH ROW EXECUTE FUNCTION test_omitir_recorreccion()`)
    try {
      expect((await corregir(e)).status).toBe(409)
    } finally {
      await bd.query('DROP TRIGGER tg_test_omitir_recorreccion ON nota')
      await bd.query('DROP FUNCTION test_omitir_recorreccion()')
    }
    expect(await notaDe(e)).toEqual({
      valor: '5.5',
      estado: 'PUBLICADA',
      recorreccion_id: null,
    })
    expect(await eventosDe(e)).toEqual([])
  })
  it.each([
    AYUDANTE,
    ALUMNO,
    'administrativo.ingenieria@norte.cursus.test',
    'director@norte.cursus.test',
  ])('%s no puede recorregir', async (correo) => {
    const e = await escenario()
    expect((await corregir(e, cambio(), correo)).status).toBe(403)
    expect(await eventosDe(e)).toEqual([])
  })
  it('rechaza otro profesor, otra sección, otra universidad y UUID inválidos', async () => {
    const e = await escenario()
    expect((await corregir(e, cambio(), otroProfesor)).status).toBe(403)
    expect(
      (await corregir(e, cambio(), 'profesor@sur.cursus.test')).status,
    ).toBe(404)
    expect(
      (await corregir(e, cambio(), PROFESOR, alumno, otraSeccion)).status,
    ).toBe(403)
    expect((await corregir(e, cambio(), PROFESOR, NO_EXISTE)).status).toBe(404)
    expect((await corregir('invalida')).status).toBe(400)
    expect((await corregir(e, cambio(), PROFESOR, 'invalido')).status).toBe(400)
    await request(app.getHttpServer()).post(ruta(e)).send(cambio()).expect(401)
  })
  it.each(['evaluacion', 'seccion', 'curso'])(
    'rechaza la %s archivada sin modificar la nota',
    async (tabla) => {
      const e = await escenario()
      const q = bd.createQueryRunner()
      const [{ id }] = await bd.query<{ id: string }[]>(
        `SELECT ${tabla === 'evaluacion' ? 'e.id' : tabla === 'seccion' ? 's.id' : 's.curso_id AS id'}
      FROM evaluacion e JOIN seccion s ON s.id=e.seccion_id WHERE e.id=$1`,
        [e],
      )
      await q.query(`UPDATE ${tabla} SET archived_at=now() WHERE id=$1`, [id])
      try {
        expect((await corregir(e)).status).toBe(404)
      } finally {
        await q.query(`UPDATE ${tabla} SET archived_at=NULL WHERE id=$1`, [id])
        await q.release()
      }
      expect(await eventosDe(e)).toEqual([])
    },
  )
  it('no permite cambiar una publicada sin un evento coincidente ni modificar su identidad', async () => {
    const e = await escenario()
    for (const sql of ['valor=6.2', 'propuesta_por=alumno_id']) {
      await comoApp('PROFESOR', profesor, async (q) => {
        await expect(
          q.query(`UPDATE nota SET ${sql} WHERE evaluacion_id=$1`, [e]),
        ).rejects.toMatchObject({ driverError: { code: '23514' } })
      })
    }
  })
  it.each<Rol>(['AYUDANTE', 'ALUMNO', 'ADMINISTRATIVO', 'DIRECTOR'])(
    'RLS no permite modificar la publicada como %s',
    async (rol) => {
      const e = await escenario()
      await comoApp(rol, ayudante, async (q) => {
        const [, filas] = await q.query<[unknown[], number]>(
          'UPDATE nota SET valor=6.2 WHERE evaluacion_id=$1 RETURNING id',
          [e],
        )
        expect(filas).toBe(0)
      })
      expect((await notaDe(e)).valor).toBe('5.5')
    },
  )
})
