import type { ProfesorQuitado, ProfesorResumen } from '@cursus/shared'
import { ConflictException, type INestApplication } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { AppModule } from '../../src/app.module.js'
import { AuthService } from '../../src/auth/auth.service.js'
import { configurarApp } from '../../src/config/configurar-app.js'
import { AsignacionesService } from '../../src/gestion/asignaciones.service.js'
import { ProfesoresService } from '../../src/gestion/profesores.service.js'

// GES-25 sin llegar a la base: sesión, CASL, el cuerpo y las respuestas HTTP.
// Los servicios se reemplazan; el comportamiento real (sincronización, RLS,
// permisos de los profesores) está en profesores-seccion.db-spec.ts.
const jwt = new JwtService({ secret: process.env.JWT_SECRET })
const sesionDe = (rol: string) =>
  `Bearer ${jwt.sign({
    sub: '00000000-0000-0000-0000-000000000001',
    sid: '00000000-0000-0000-0000-000000000003',
    rol,
    universidad_id: '00000000-0000-0000-0000-000000000002',
  })}`

const SECCION = '00000000-0000-4000-8000-000000000005'
const PROFESOR = '00000000-0000-4000-8000-000000000007'
const RUTA = `/api/secciones/${SECCION}/profesores`
const QUITAR = `${RUTA}/${PROFESOR}/quitar`

const ASIGNADOS: ProfesorResumen[] = [
  { id: PROFESOR, nombre: 'Profesor Norte', correo: 'p@norte.cl' },
]
let agregar: () => Promise<ProfesorResumen[]>
const llamadas: string[] = []

describe('profesores de una sección (GES-25, e2e)', () => {
  let app: INestApplication<App>

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthService)
      .useValue({ sesionActiva: () => Promise.resolve(true) })
      .overrideProvider(ProfesoresService)
      .useValue({
        listar: () => Promise.resolve([]),
        agregar: (_c: unknown, _u: string, _s: string, profesorId: string) => {
          llamadas.push(`agregar ${profesorId}`)
          return agregar()
        },
      })
      .overrideProvider(AsignacionesService)
      .useValue({
        quitarUnProfesor: (
          _c: unknown,
          _u: string,
          _s: string,
          profesorId: string,
          motivo: string,
        ): Promise<ProfesorQuitado> => {
          llamadas.push(`quitar ${profesorId} ${motivo}`)
          return Promise.resolve({
            quitado: { id: profesorId, nombre: 'Profesor Norte' },
            quitadoEn: '2026-11-09T12:00:00.000Z',
            quitadoPor: { id: 'a', nombre: 'Administrativo' },
            motivo,
            profesores: [],
          })
        },
      })
      .compile()
    app = modulo.createNestApplication<INestApplication<App>>({
      logger: false,
    })
    configurarApp(app, { secretoOrigen: '' })
    await app.init()
  })
  afterAll(async () => {
    await app?.close()
  })
  beforeEach(() => {
    agregar = () => Promise.resolve(ASIGNADOS)
    llamadas.length = 0
  })

  it('agregar responde 200 con los profesores asignados', async () => {
    const res = await request(app.getHttpServer())
      .post(RUTA)
      .set('Authorization', sesionDe('ADMINISTRATIVO'))
      .send({ profesorId: PROFESOR })
      .expect(200)
    expect(res.body).toEqual(ASIGNADOS)
    expect(llamadas).toEqual([`agregar ${PROFESOR}`])
  })

  it('agregar un profesor duplicado responde 409 con el mensaje', async () => {
    agregar = () =>
      Promise.reject(
        new ConflictException('Profesor Norte ya es profesor de esta sección'),
      )
    const res = await request(app.getHttpServer())
      .post(RUTA)
      .set('Authorization', sesionDe('ADMINISTRATIVO'))
      .send({ profesorId: PROFESOR })
      .expect(409)
    expect((res.body as { message: string }).message).toBe(
      'Profesor Norte ya es profesor de esta sección',
    )
  })

  it.each([
    ['sin profesorId', {}],
    ['con un id que no es UUID', { profesorId: 'x' }],
  ])(
    'agregar %s responde 400 sin llegar al servicio',
    async (_caso, cuerpo) => {
      await request(app.getHttpServer())
        .post(RUTA)
        .set('Authorization', sesionDe('ADMINISTRATIVO'))
        .send(cuerpo)
        .expect(400)
      expect(llamadas).toEqual([])
    },
  )

  it.each([
    ['sin motivo', {}],
    ['con un motivo vacío', { motivo: '   ' }],
    ['con un motivo de más de 500 caracteres', { motivo: 'a'.repeat(501) }],
  ])('quitar %s responde 400 sin llegar al servicio', async (_caso, cuerpo) => {
    await request(app.getHttpServer())
      .patch(QUITAR)
      .set('Authorization', sesionDe('ADMINISTRATIVO'))
      .send(cuerpo)
      .expect(400)
    expect(llamadas).toEqual([])
  })

  it('quitar con motivo responde 200', async () => {
    const res = await request(app.getHttpServer())
      .patch(QUITAR)
      .set('Authorization', sesionDe('ADMINISTRATIVO'))
      .send({ motivo: 'Se asignó por error' })
      .expect(200)
    expect((res.body as ProfesorQuitado).motivo).toBe('Se asignó por error')
  })

  it('sin sesión responde 401', async () => {
    await request(app.getHttpServer()).post(RUTA).expect(401)
  })

  it.each(['PROFESOR', 'AYUDANTE', 'ALUMNO', 'DIRECTOR'])(
    '%s no tiene permiso CASL: 403',
    async (rol) => {
      await request(app.getHttpServer())
        .post(RUTA)
        .set('Authorization', sesionDe(rol))
        .send({ profesorId: PROFESOR })
        .expect(403)
      await request(app.getHttpServer())
        .patch(QUITAR)
        .set('Authorization', sesionDe(rol))
        .send({ motivo: 'x' })
        .expect(403)
      expect(llamadas).toEqual([])
    },
  )
})
