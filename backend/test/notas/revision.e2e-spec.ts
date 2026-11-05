import type { NotasEvaluacion, Rol, SeccionEspacio } from '@cursus/shared'
import { ConflictException, type INestApplication } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { AppModule } from '../../src/app.module.js'
import { AuthService } from '../../src/auth/auth.service.js'
import { configurarApp } from '../../src/config/configurar-app.js'
import { AccesoSeccionService } from '../../src/espacio/acceso-seccion.service.js'
import { NotasService } from '../../src/notas/notas.service.js'

// NOT-11 sin llegar a la base: sesión, CASL, el rol en la sección y las
// respuestas HTTP. El acceso a la sección y el servicio se reemplazan; la
// aprobación real (atómica, concurrente y con RLS) está en notas.db-spec.ts.
const jwt = new JwtService({ secret: process.env.JWT_SECRET })
const sesion = (rol: Rol) =>
  `Bearer ${jwt.sign({
    sub: '00000000-0000-4000-8000-000000000001',
    sid: '00000000-0000-4000-8000-000000000003',
    universidad_id: '00000000-0000-4000-8000-000000000002',
    rol,
  })}`
const SECCION = '00000000-0000-4000-8000-000000000010'
const EVALUACION = '00000000-0000-4000-8000-000000000020'
const RUTA = `/api/espacio/secciones/${SECCION}/evaluaciones/${EVALUACION}/notas/aprobacion`

const APROBADA: NotasEvaluacion = {
  evaluacion: {
    id: EVALUACION,
    nombre: 'Control 1',
    fecha: '2026-09-01',
    ponderacion: 20,
  },
  estado: 'APROBADA',
  alumnos: [],
}

// El rol con que el usuario entra a la sección y lo que responde el servicio.
let rolEnSeccion: Rol = 'PROFESOR'
let respuesta: () => Promise<NotasEvaluacion> = () => Promise.resolve(APROBADA)
const llamadas: string[] = []

let app: INestApplication<App>
beforeAll(async () => {
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(AuthService)
    .useValue({ sesionActiva: () => Promise.resolve(true) })
    .overrideProvider(AccesoSeccionService)
    .useValue({
      verificar: (): Promise<SeccionEspacio> =>
        Promise.resolve({
          id: SECCION,
          numero: 1,
          curso: { id: 'c', codigo: 'ICC101', nombre: 'Programación' },
          periodo: { id: 'p', anio: 2026, semestre: 2 },
          rol: rolEnSeccion,
        }),
    })
    .overrideProvider(NotasService)
    .useValue({
      aprobar: (_c: unknown, _u: string, _s: unknown, evaluacionId: string) => {
        llamadas.push(evaluacionId)
        return respuesta()
      },
    })
    .compile()
  app = modulo.createNestApplication<INestApplication<App>>({ logger: false })
  configurarApp(app, { secretoOrigen: '' })
  await app.init()
})
afterAll(async () => {
  await app?.close()
})
beforeEach(() => {
  rolEnSeccion = 'PROFESOR'
  respuesta = () => Promise.resolve(APROBADA)
  llamadas.length = 0
})

describe('POST .../notas/aprobacion (NOT-11)', () => {
  it('responde 401 sin sesión', async () => {
    await request(app.getHttpServer()).post(RUTA).expect(401)
  })

  it('el profesor de la sección recibe 200 con las notas aprobadas', async () => {
    const res = await request(app.getHttpServer())
      .post(RUTA)
      .set('Authorization', sesion('PROFESOR'))
      .expect(200)
    expect((res.body as NotasEvaluacion).estado).toBe('APROBADA')
    expect(llamadas).toEqual([EVALUACION])
  })

  it('un 409 del servicio llega con su mensaje', async () => {
    respuesta = () =>
      Promise.reject(new ConflictException('Las notas ya fueron aprobadas'))
    const res = await request(app.getHttpServer())
      .post(RUTA)
      .set('Authorization', sesion('PROFESOR'))
      .expect(409)
    expect((res.body as { message: string }).message).toBe(
      'Las notas ya fueron aprobadas',
    )
  })

  it.each<Rol>(['AYUDANTE', 'ALUMNO', 'ADMINISTRATIVO', 'DIRECTOR'])(
    '%s no tiene permiso CASL para aprobar: 403',
    async (rol) => {
      await request(app.getHttpServer())
        .post(RUTA)
        .set('Authorization', sesion(rol))
        .expect(403)
      expect(llamadas).toEqual([])
    },
  )

  it('un profesor que entra a la sección con otro rol recibe 403', async () => {
    rolEnSeccion = 'AYUDANTE'
    await request(app.getHttpServer())
      .post(RUTA)
      .set('Authorization', sesion('PROFESOR'))
      .expect(403)
    expect(llamadas).toEqual([])
  })

  it('un id de evaluación que no es UUID responde 400', async () => {
    await request(app.getHttpServer())
      .post(RUTA.replace(EVALUACION, 'no-es-uuid'))
      .set('Authorization', sesion('PROFESOR'))
      .expect(400)
    expect(llamadas).toEqual([])
  })
})
