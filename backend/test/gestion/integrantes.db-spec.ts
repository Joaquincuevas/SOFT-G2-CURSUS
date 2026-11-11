import type {
  BusquedaIntegrantes,
  IntegrantesSeccion,
  RolIntegrante,
} from '@cursus/shared'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { DataSource } from 'typeorm'
import { AppModule } from '../../src/app.module.js'
import type { RespuestaLogin } from '../../src/auth/auth.controller.js'
import { configurarApp } from '../../src/config/configurar-app.js'
import { opcionesDataSource } from '../../src/database/data-source.js'
import { ejecutarSeed } from '../../src/database/seed.js'
const BD_TEST = `${process.env.POSTGRES_TEST_DB ?? 'cursus_test'}_integrantes`
const BD_ORIGINAL = process.env.POSTGRES_DB
const PASSWORD = 'contraseña-de-prueba'
const ADMIN = 'administrativo.ingenieria@norte.cursus.test'
const ROLES: RolIntegrante[] = ['PROFESOR', 'AYUDANTE', 'ALUMNO']
let admin: DataSource,
  bd: DataSource,
  app: INestApplication<App>,
  seccion: string,
  universidad: string
const ids = {} as Record<RolIntegrante, string>
const correos = {
  PROFESOR: 'profesor@norte.cursus.test',
  AYUDANTE: 'ayudante@norte.cursus.test',
  ALUMNO: 'alumno@norte.cursus.test',
}
const tokens = new Map<string, string>()
const ruta = () => `/api/secciones/${seccion}/integrantes`
async function tokenDe(correo = ADMIN) {
  if (!tokens.has(correo)) {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ correo, password: PASSWORD })
      .expect(200)
    tokens.set(correo, (res.body as RespuestaLogin).accessToken)
  }
  return tokens.get(correo)!
}
async function pedir(
  metodo: 'get' | 'post' | 'patch',
  destino: string,
  estado = 200,
  cuerpo?: object,
  correo = ADMIN,
) {
  const token = await tokenDe(correo)
  const req = request(app.getHttpServer())
    [metodo](destino)
    .set('Authorization', `Bearer ${token}`)
  return (await (cuerpo ? req.send(cuerpo) : req).expect(estado))
    .body as unknown
}
const listar = async () => (await pedir('get', ruta())) as IntegrantesSeccion
async function dejarFuera(rol: RolIntegrante) {
  const tabla = {
    PROFESOR: 'seccion_profesor',
    AYUDANTE: 'ayudante_seccion',
    ALUMNO: 'inscripcion',
  }[rol]
  await bd.query(
    `UPDATE ${tabla} SET archived_at=now()${rol === 'ALUMNO' ? ',archivada_por=$3' : ''} WHERE seccion_id=$1 AND usuario_id=$2 AND archived_at IS NULL`,
    rol === 'ALUMNO'
      ? [seccion, ids[rol], await idDe(ADMIN)]
      : [seccion, ids[rol]],
  )
}
const idDe = async (correo: string) =>
  (
    await bd.query<{ id: string }[]>('SELECT id FROM usuario WHERE correo=$1', [
      correo,
    ])
  )[0].id
beforeAll(async () => {
  admin = await new DataSource(opcionesDataSource()).initialize()
  await admin.query(`DROP DATABASE IF EXISTS "${BD_TEST}" WITH (FORCE)`)
  await admin.query(`CREATE DATABASE "${BD_TEST}"`)
  bd = await new DataSource(opcionesDataSource(BD_TEST)).initialize()
  await bd.runMigrations()
  await ejecutarSeed(bd, PASSWORD)
  const [s] = await bd.query<{ id: string; universidad_id: string }[]>(
    `SELECT s.id,s.universidad_id FROM seccion s JOIN curso c ON c.id=s.curso_id JOIN universidad u ON u.id=s.universidad_id WHERE c.codigo='ICC101' AND s.numero=1 AND u.dominio_correo='norte.cursus.test'`,
  )
  seccion = s.id
  universidad = s.universidad_id
  for (const rol of ROLES) ids[rol] = await idDe(correos[rol])
  for (const rol of ROLES) await dejarFuera(rol)
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

it.each(ROLES)(
  'busca y agrega %s por id conservando los demás integrantes',
  async (rol) => {
    await dejarFuera(rol)
    const consulta = (await pedir(
      'get',
      `${ruta()}/buscar?rol=${rol}&q=${encodeURIComponent(correos[rol])}`,
    )) as BusquedaIntegrantes
    expect(consulta.personas).toContainEqual({
      id: ids[rol],
      nombre: expect.any(String) as string,
      correo: correos[rol],
      rol,
    })
    const antes = (await listar()).integrantes.filter((p) => p.rol !== rol)
    await pedir('post', ruta(), 204, { rol, usuarioId: ids[rol] })
    const despues = (await listar()).integrantes
    expect(despues.find((p) => p.id === ids[rol])).toMatchObject({
      rol,
      correo: correos[rol],
    })
    expect(despues.filter((p) => p.rol !== rol)).toEqual(antes)
    const oculto = (await pedir(
      'get',
      `${ruta()}/buscar?rol=${rol}&q=${encodeURIComponent(correos[rol])}`,
    )) as BusquedaIntegrantes
    expect(oculto.personas.some((p) => p.id === ids[rol])).toBe(false)
  },
)
it.each(ROLES)(
  'retira %s con motivo e historial y permite volver a agregarlo',
  async (rol) => {
    await dejarFuera(rol)
    await pedir('post', ruta(), 204, { rol, usuarioId: ids[rol] })
    await pedir('patch', `${ruta()}/${ids[rol]}/quitar`, 204, {
      rol,
      motivo: '  Corrección de sección  ',
    })
    expect((await listar()).integrantes.some((p) => p.id === ids[rol])).toBe(
      false,
    )
    if (rol === 'ALUMNO') {
      const [baja] = await bd.query<
        { motivo_retiro: string; archivada_por: string; archived_at: Date }[]
      >(
        'SELECT motivo_retiro,archivada_por,archived_at FROM inscripcion WHERE seccion_id=$1 AND usuario_id=$2 ORDER BY archived_at DESC NULLS LAST LIMIT 1',
        [seccion, ids[rol]],
      )
      expect(baja.motivo_retiro).toBe('Corrección de sección')
      expect(baja.archivada_por).toBe(await idDe(ADMIN))
      expect(baja.archived_at).toBeInstanceOf(Date)
    } else {
      const [baja] = await bd.query<
        { motivo: string; responsable_id: string }[]
      >(
        'SELECT motivo,responsable_id FROM asignacion_cambio WHERE seccion_id=$1 AND anterior_id=$2 ORDER BY fecha DESC LIMIT 1',
        [seccion, ids[rol]],
      )
      expect(baja).toMatchObject({
        motivo: 'Corrección de sección',
        responsable_id: await idDe(ADMIN),
      })
    }
    await pedir('post', ruta(), 204, { rol, usuarioId: ids[rol] })
    expect((await listar()).integrantes.some((p) => p.id === ids[rol])).toBe(
      true,
    )
  },
)
it('busca también por nombre y trata los comodines como texto literal', async () => {
  await dejarFuera('ALUMNO')
  const porNombre = (await pedir(
    'get',
    `${ruta()}/buscar?rol=ALUMNO&q=Alumno%20Norte`,
  )) as BusquedaIntegrantes
  expect(porNombre.personas.some((p) => p.id === ids.ALUMNO)).toBe(true)
  const literal = (await pedir(
    'get',
    `${ruta()}/buscar?rol=ALUMNO&q=%25_`,
  )) as BusquedaIntegrantes
  expect(literal.personas).toEqual([])
})
it('limita la búsqueda a 20 y avisa si hay más coincidencias', async () => {
  const resultado = (await pedir(
    'get',
    `${ruta()}/buscar?rol=ALUMNO&q=norte.cursus.test`,
  )) as BusquedaIntegrantes
  expect(resultado.personas).toHaveLength(20)
  expect(resultado.hayMas).toBe(true)
})
it('no ofrece cuentas archivadas y rechaza agregar roles incorrectos o personas ajenas', async () => {
  await dejarFuera('ALUMNO')
  await bd.query('UPDATE usuario SET archived_at=now() WHERE id=$1', [
    ids.ALUMNO,
  ])
  try {
    expect(
      (
        (await pedir(
          'get',
          `${ruta()}/buscar?rol=ALUMNO&q=Alumno%20Norte`,
        )) as BusquedaIntegrantes
      ).personas,
    ).toEqual([])
    await pedir('post', ruta(), 404, { rol: 'ALUMNO', usuarioId: ids.ALUMNO })
  } finally {
    await bd.query('UPDATE usuario SET archived_at=NULL WHERE id=$1', [
      ids.ALUMNO,
    ])
  }
  await pedir('post', ruta(), 404, { rol: 'PROFESOR', usuarioId: ids.ALUMNO })
  await pedir('post', ruta(), 400, { rol: 'AYUDANTE', usuarioId: ids.PROFESOR })
  await pedir('post', ruta(), 404, {
    rol: 'ALUMNO',
    usuarioId: await idDe('alumno@sur.cursus.test'),
  })
})
it.each([
  'profesor@norte.cursus.test',
  'ayudante@norte.cursus.test',
  'alumno@norte.cursus.test',
  'director@norte.cursus.test',
])('%s no administra integrantes', async (correo) => {
  await pedir('get', ruta(), 403, undefined, correo)
  await pedir(
    'get',
    `${ruta()}/buscar?rol=ALUMNO&q=Alumno`,
    403,
    undefined,
    correo,
  )
  await pedir(
    'post',
    ruta(),
    403,
    { rol: 'ALUMNO', usuarioId: ids.ALUMNO },
    correo,
  )
  await pedir(
    'patch',
    `${ruta()}/${ids.ALUMNO}/quitar`,
    403,
    { rol: 'ALUMNO', motivo: 'Motivo' },
    correo,
  )
})
it('rechaza un administrativo de otra facultad o universidad sin revelar la sección', async () => {
  for (const correo of [
    'administrativo.economia@norte.cursus.test',
    'administrativo@sur.cursus.test',
  ]) {
    await pedir('get', ruta(), 404, undefined, correo)
    await pedir(
      'get',
      `${ruta()}/buscar?rol=ALUMNO&q=Alumno`,
      404,
      undefined,
      correo,
    )
    await pedir(
      'post',
      ruta(),
      404,
      { rol: 'ALUMNO', usuarioId: ids.ALUMNO },
      correo,
    )
  }
})
it('conserva el retiro legado sin motivo y el CSV con errores parciales', async () => {
  await dejarFuera('ALUMNO')
  await pedir('post', ruta(), 204, { rol: 'ALUMNO', usuarioId: ids.ALUMNO })
  await pedir(
    'patch',
    `/api/secciones/${seccion}/alumnos/${ids.ALUMNO}/quitar`,
    200,
  )
  const [vieja] = await bd.query<{ motivo_retiro: string | null }[]>(
    'SELECT motivo_retiro FROM inscripcion WHERE seccion_id=$1 AND usuario_id=$2 ORDER BY archived_at DESC NULLS LAST LIMIT 1',
    [seccion, ids.ALUMNO],
  )
  expect(vieja.motivo_retiro).toBeNull()
  const resultado = (await pedir(
    'post',
    `/api/secciones/${seccion}/alumnos/csv`,
    200,
    { csv: `correo,nombre\n${correos.ALUMNO},Alumno Norte\ncorreo-malo,Error` },
  )) as { cargados: number; errores: number }
  expect(resultado).toMatchObject({ cargados: 1, errores: 1 })
  expect((await listar()).integrantes.some((p) => p.id === ids.ALUMNO)).toBe(
    true,
  )
})
it('la restricción conserva la coherencia del motivo con el retiro', async () => {
  await expect(
    bd.query(
      "UPDATE inscripcion SET motivo_retiro='Motivo' WHERE seccion_id=$1 AND usuario_id=$2 AND archived_at IS NULL",
      [seccion, ids.ALUMNO],
    ),
  ).rejects.toMatchObject({
    driverError: { constraint: 'ck_inscripcion_motivo_retiro' },
  })
  expect(universidad).toBeTruthy()
})
