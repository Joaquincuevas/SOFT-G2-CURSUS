import { randomUUID } from 'node:crypto'
import type {
  CursoEditable,
  CambioCurso,
  Carrera,
  OpcionPeriodo,
} from '@cursus/shared'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { DataSource } from 'typeorm'
import { AppModule } from '../../src/app.module.js'
import { configurarApp } from '../../src/config/configurar-app.js'
import { opcionesDataSource } from '../../src/database/data-source.js'
import { ejecutarSeed } from '../../src/database/seed.js'

const BD_TEST = `${process.env.POSTGRES_TEST_DB ?? 'cursus_test'}_edicion_curso`
const BD_ORIGINAL = process.env.POSTGRES_DB
const PASSWORD = 'password-solo-para-pruebas'
const INGENIERIA = 'administrativo.ingenieria@norte.cursus.test'
const ECONOMIA = 'administrativo.economia@norte.cursus.test'
const SALUD = 'administrativo@sur.cursus.test'
let admin: DataSource
let bd: DataSource
let app: INestApplication<App>
const tokens = new Map<string, string>()

async function tokenDe(correo: string) {
  if (tokens.has(correo)) return tokens.get(correo)!
  const respuesta = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ correo, password: PASSWORD })
    .expect(200)
  const { accessToken } = respuesta.body as { accessToken: string }
  tokens.set(correo, accessToken)
  return accessToken
}

async function solicitar(
  ruta: string,
  metodo: 'get' | 'post' | 'patch',
  cuerpo?: object,
  correo = INGENIERIA,
) {
  const token = await tokenDe(correo)
  const pedido = request(app.getHttpServer())
    [metodo](ruta)
    .set('Authorization', `Bearer ${token}`)
  return cuerpo ? pedido.send(cuerpo) : pedido
}
const datosDe = (curso: CursoEditable) => ({
  codigo: curso.codigo,
  nombre: curso.nombre,
  carreraId: curso.carreraId,
  periodoId: curso.periodoId,
})
let carreraId: string
let periodoId: string
async function nuevo(correo = INGENIERIA) {
  const carreras = await solicitar('/api/carreras', 'get', undefined, correo)
  const periodos = await solicitar('/api/periodos', 'get', undefined, correo)
  const carrera = (carreras.body as Carrera[]).find(
    (c) => c.nombre !== 'Alternativa para edicion',
  )!
  const [periodo] = periodos.body as OpcionPeriodo[]
  const creado = await solicitar(
    '/api/cursos',
    'post',
    {
      codigo: `E${randomUUID().slice(0, 8)}`,
      nombre: 'Curso original',
      carreraId: carrera.id,
      periodoId: periodo.id,
    },
    correo,
  )
  expect(creado.status).toBe(201)
  const edicion = await solicitar(
    `/api/cursos/${(creado.body as { id: string }).id}/edicion`,
    'get',
    undefined,
    correo,
  )
  expect(edicion.status).toBe(200)
  return edicion.body as CursoEditable
}
const editar = (curso: CursoEditable, cambios: object, correo = INGENIERIA) =>
  solicitar(
    `/api/cursos/${curso.id}`,
    'patch',
    { ...datosDe(curso), ...cambios },
    correo,
  )
async function historial(curso: CursoEditable) {
  const respuesta = await solicitar(`/api/cursos/${curso.id}/historial`, 'get')
  expect(respuesta.status).toBe(200)
  return respuesta.body as CambioCurso[]
}

beforeAll(async () => {
  admin = await new DataSource(opcionesDataSource()).initialize()
  await admin.query(`DROP DATABASE IF EXISTS "${BD_TEST}" WITH (FORCE)`)
  await admin.query(`CREATE DATABASE "${BD_TEST}"`)
  bd = await new DataSource(opcionesDataSource(BD_TEST)).initialize()
  await bd.runMigrations()
  await ejecutarSeed(bd, PASSWORD)
  process.env.POSTGRES_DB = BD_TEST
  const modulo = await Test.createTestingModule({
    imports: [AppModule],
  }).compile()
  app = modulo.createNestApplication<INestApplication<App>>({ logger: false })
  configurarApp(app, { secretoOrigen: '' })
  await app.listen(0, '127.0.0.1')
  const carrera = await solicitar('/api/carreras', 'post', {
    nombre: 'Alternativa para edicion',
  })
  carreraId = (carrera.body as Carrera).id
  const periodo = await solicitar('/api/periodos', 'post', {
    anio: 2039,
    semestre: 1,
    fechaInicio: '2039-03-01',
    fechaTermino: '2039-07-15',
  })
  periodoId = (periodo.body as OpcionPeriodo).id
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

describe('GES-07: edición de cursos y auditoría', () => {
  it('edita los cuatro campos y registra fecha, responsable y snapshots completos', async () => {
    const curso = await nuevo()
    expect(await historial(curso)).toEqual([])
    const respuesta = await editar(curso, {
      codigo: ' edit-07 ',
      nombre: ' Curso actualizado ',
      carreraId,
      periodoId,
    })
    expect(respuesta.status).toBe(200)
    const actualizado = respuesta.body as CursoEditable
    expect(actualizado).toMatchObject({
      codigo: 'EDIT-07',
      nombre: 'Curso actualizado',
      carreraId,
      periodoId,
    })
    const [cambio] = await historial(curso)
    expect(cambio.anterior).toEqual(curso)
    expect(cambio.nuevo).toEqual(actualizado)
    expect(Number.isNaN(Date.parse(cambio.fecha))).toBe(false)
    const usuario = await solicitar('/api/auth/yo', 'get')
    expect(cambio.responsable.id).toBe((usuario.body as { id: string }).id)
    expect(cambio.responsable.nombre).toBe('Administrativo Ingeniería Norte')
    const detalle = await solicitar(`/api/cursos/${curso.id}`, 'get')
    expect(detalle.body).toMatchObject({
      codigo: 'EDIT-07',
      nombre: 'Curso actualizado',
      carreraNombre: actualizado.carreraNombre,
      periodo: actualizado.periodo,
    })
  })

  it('mantiene las secciones y refleja el curso en listado, detalle y filtros', async () => {
    const curso = await nuevo()
    await solicitar(`/api/cursos/${curso.id}/secciones`, 'post')
    const respuesta = await editar(curso, { periodoId, nombre: 'Con sección' })
    expect(respuesta.status).toBe(200)
    const detalle = await solicitar(`/api/cursos/${curso.id}`, 'get')
    expect((detalle.body as { secciones: unknown[] }).secciones).toHaveLength(1)
    const listado = await solicitar(`/api/cursos?periodoId=${periodoId}`, 'get')
    expect(listado.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: curso.id, nombre: 'Con sección' }),
      ]),
    )
    const anterior = await solicitar(
      `/api/cursos?periodoId=${curso.periodoId}`,
      'get',
    )
    expect(
      (anterior.body as { id: string }[]).some((c) => c.id === curso.id),
    ).toBe(false)
  })

  it('un guardado sin cambios no agrega historial, incluidos UUID en mayúsculas y normalización', async () => {
    const curso = await nuevo()
    expect(
      (
        await editar(curso, {
          codigo: ` ${curso.codigo.toLowerCase()} `,
          nombre: ` ${curso.nombre} `,
          carreraId: curso.carreraId.toUpperCase(),
          periodoId: curso.periodoId.toUpperCase(),
        })
      ).status,
    ).toBe(200)
    expect(await historial(curso)).toEqual([])
    expect((await editar(curso, { nombre: 'Solo nombre' })).status).toBe(200)
    expect(await historial(curso)).toHaveLength(1)
  })

  it('un código duplicado responde 409 y no cambia datos ni historial', async () => {
    const curso = await nuevo()
    const otro = await nuevo()
    expect(
      (await editar(curso, { codigo: otro.codigo.toLowerCase() })).status,
    ).toBe(409)
    expect(await historial(curso)).toEqual([])
    expect(
      (await solicitar(`/api/cursos/${curso.id}/edicion`, 'get')).body,
    ).toEqual(curso)
  })

  it('también rechaza colisión al cambiar de período e incluye cursos archivados', async () => {
    const curso = await nuevo()
    const otro = await nuevo()
    expect(
      (await editar(otro, { codigo: curso.codigo, periodoId })).status,
    ).toBe(200)
    await bd.query('UPDATE curso SET archived_at = now() WHERE id = $1', [
      otro.id,
    ])
    expect((await editar(curso, { periodoId })).status).toBe(409)
    expect(await historial(curso)).toEqual([])
  })

  it.each([
    ['código vacío', { codigo: '  ' }],
    ['código largo', { codigo: 'A'.repeat(21) }],
    ['nombre vacío', { nombre: '' }],
    ['nombre largo', { nombre: 'N'.repeat(201) }],
    ['código numérico', { codigo: 123 }],
    ['carrera inválida', { carreraId: 'abc' }],
    ['período inválido', { periodoId: null }],
    ['universidad extra', { universidadId: randomUUID() }],
    ['responsable falso', { responsableId: randomUUID() }],
    ['campo ausente', { nombre: undefined }],
  ])('comparte las validaciones de creación: %s', async (_caso, cambios) => {
    const curso = await nuevo()
    expect((await editar(curso, cambios)).status).toBe(400)
    expect(await historial(curso)).toEqual([])
  })

  it('rechaza destinos de otra facultad/universidad, archivados e inexistentes', async () => {
    const curso = await nuevo()
    const economia = await nuevo(ECONOMIA)
    const sur = await nuevo(SALUD)
    for (const cambio of [
      { carreraId: economia.carreraId },
      { carreraId: sur.carreraId },
      { periodoId: sur.periodoId },
      { carreraId: randomUUID() },
      { periodoId: randomUUID() },
    ]) {
      expect((await editar(curso, cambio)).status).toBe(404)
    }
    const carrera = await solicitar('/api/carreras', 'post', {
      nombre: 'Archivada edición',
    })
    const id = (carrera.body as Carrera).id
    await bd.query('UPDATE carrera SET archived_at = now() WHERE id = $1', [id])
    expect((await editar(curso, { carreraId: id })).status).toBe(404)
    expect(await historial(curso)).toEqual([])
  })

  it('un curso ajeno o archivado no puede leerse para editar, editarse ni consultar su historial', async () => {
    const curso = await nuevo()
    for (const correo of [ECONOMIA, SALUD]) {
      expect((await editar(curso, { nombre: 'Intruso' }, correo)).status).toBe(
        404,
      )
      for (const sufijo of ['edicion', 'historial'])
        expect(
          (
            await solicitar(
              `/api/cursos/${curso.id}/${sufijo}`,
              'get',
              undefined,
              correo,
            )
          ).status,
        ).toBe(404)
    }
    await bd.query('UPDATE curso SET archived_at = now() WHERE id = $1', [
      curso.id,
    ])
    expect((await editar(curso, { nombre: 'Archivado' })).status).toBe(404)
  })

  it.each(['director', 'profesor', 'ayudante', 'alumno'])(
    '%s recibe 403 en las tres operaciones',
    async (rol) => {
      const curso = await nuevo()
      const correo = `${rol}@norte.cursus.test`
      expect(
        (await editar(curso, { nombre: 'Sin permiso' }, correo)).status,
      ).toBe(403)
      for (const sufijo of ['edicion', 'historial'])
        expect(
          (
            await solicitar(
              `/api/cursos/${curso.id}/${sufijo}`,
              'get',
              undefined,
              correo,
            )
          ).status,
        ).toBe(403)
    },
  )

  it('exige sesión y valida el ID de curso', async () => {
    const curso = await nuevo()
    await request(app.getHttpServer())
      .patch(`/api/cursos/${curso.id}`)
      .send(datosDe(curso))
      .expect(401)
    for (const sufijo of ['edicion', 'historial'])
      await request(app.getHttpServer())
        .get(`/api/cursos/${curso.id}/${sufijo}`)
        .expect(401)
    expect((await editar({ ...curso, id: 'abc' }, {})).status).toBe(400)
    expect((await editar({ ...curso, id: randomUUID() }, {})).status).toBe(404)
  })

  it('dos ediciones simultáneas conservan una cadena fiel de valores anteriores', async () => {
    const curso = await nuevo()
    const respuestas = await Promise.all([
      editar(curso, { nombre: 'Primera edición' }),
      editar(curso, { nombre: 'Segunda edición' }),
    ])
    expect(respuestas.map((r) => r.status)).toEqual([200, 200])
    const cambios = await historial(curso)
    expect(cambios).toHaveLength(2)
    expect(cambios[1].anterior).toEqual(curso)
    expect(cambios[0].anterior).toEqual(cambios[1].nuevo)
    expect(
      (await solicitar(`/api/cursos/${curso.id}/edicion`, 'get')).body,
    ).toEqual(cambios[0].nuevo)
  })

  it('si falla el registro de auditoría, la edición completa se revierte', async () => {
    const curso = await nuevo()
    await bd.query(
      'ALTER TABLE curso_cambio ADD CONSTRAINT ck_test_auditoria CHECK (false) NOT VALID',
    )
    try {
      expect(
        (await editar(curso, { nombre: 'No debe guardarse' })).status,
      ).toBe(500)
    } finally {
      await bd.query(
        'ALTER TABLE curso_cambio DROP CONSTRAINT ck_test_auditoria',
      )
    }
    expect(
      (await solicitar(`/api/cursos/${curso.id}/edicion`, 'get')).body,
    ).toEqual(curso)
    expect(await historial(curso)).toEqual([])
  })

  it('el historial no permite UPDATE/DELETE al rol de API y RLS oculta otras universidades', async () => {
    const curso = await nuevo()
    await editar(curso, { nombre: 'Auditable' })
    const [{ universidad_id: universidad }] = await bd.query<
      { universidad_id: string }[]
    >('SELECT universidad_id FROM curso WHERE id = $1', [curso.id])
    const [{ universidad_id: otra }] = await bd.query<
      { universidad_id: string }[]
    >('SELECT universidad_id FROM usuario WHERE correo = $1', [SALUD])
    for (const sql of [
      'UPDATE curso_cambio SET nuevo = anterior',
      'DELETE FROM curso_cambio',
    ]) {
      const q = bd.createQueryRunner()
      await q.startTransaction()
      try {
        await q.query('SET LOCAL ROLE cursus_app')
        await expect(q.query(sql)).rejects.toMatchObject({ code: '42501' })
      } finally {
        await q.rollbackTransaction()
        await q.release()
      }
    }
    const q = bd.createQueryRunner()
    await q.startTransaction()
    try {
      await q.query('SET LOCAL ROLE cursus_app')
      await q.query(
        "SELECT set_config('app.universidad_id', $1, true), set_config('app.rol', 'ADMINISTRATIVO', true)",
        [otra],
      )
      expect(
        await q.query('SELECT * FROM curso_cambio WHERE universidad_id = $1', [
          universidad,
        ]),
      ).toEqual([])
    } finally {
      await q.rollbackTransaction()
      await q.release()
    }
  })
})
