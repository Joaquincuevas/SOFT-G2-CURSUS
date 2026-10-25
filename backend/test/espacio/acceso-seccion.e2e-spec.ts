import { definirAbilityPara, type Rol } from '@cursus/shared'
import type { INestApplication, Type } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { AppModule } from '../../src/app.module.js'
import { AuthService } from '../../src/auth/auth.service.js'
import { PERMISO, type Permiso } from '../../src/auth/permisos.decorator.js'
import { configurarApp } from '../../src/config/configurar-app.js'
import { AsignacionesController } from '../../src/gestion/asignaciones.controller.js'
import { AyudantesController } from '../../src/gestion/ayudantes.controller.js'
import { GestionController } from '../../src/gestion/gestion.controller.js'
import { HorariosController } from '../../src/gestion/horarios.controller.js'

// ESP-06: read Seccion para Profesor, Ayudante y Alumno no les abre la
// gestión. Sin base de datos: PermisosGuard responde antes de consultar.
const jwt = new JwtService({ secret: process.env.JWT_SECRET })
const sesion = (rol: Rol) =>
  `Bearer ${jwt.sign({
    sub: '00000000-0000-4000-8000-000000000001',
    sid: '00000000-0000-4000-8000-000000000003',
    universidad_id: '00000000-0000-4000-8000-000000000002',
    rol,
  })}`
const SECCION = '00000000-0000-4000-8000-000000000010'
const CURSO = '00000000-0000-4000-8000-000000000020'
const INTEGRANTES: Rol[] = ['PROFESOR', 'AYUDANTE', 'ALUMNO']

let app: INestApplication<App>
beforeAll(async () => {
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(AuthService)
    .useValue({ sesionActiva: () => Promise.resolve(true) })
    .compile()
  app = modulo.createNestApplication<INestApplication<App>>({ logger: false })
  configurarApp(app, { secretoOrigen: '' })
  await app.init()
})
afterAll(async () => {
  await app?.close()
})

describe('read Seccion no abre la gestión (ESP-06)', () => {
  // Todos los handlers de los controladores de gestión y su permiso.
  const CONTROLADORES: Type[] = [
    GestionController,
    AyudantesController,
    HorariosController,
    AsignacionesController,
  ]
  const handlers = CONTROLADORES.flatMap((controlador) =>
    Object.getOwnPropertyNames(controlador.prototype)
      .filter((nombre) => nombre !== 'constructor')
      .map((nombre) => ({
        ruta: `${controlador.name}.${nombre}`,
        permiso: Reflect.getMetadata(
          PERMISO,
          (controlador.prototype as Record<string, object>)[nombre],
        ) as Permiso | 'sesion' | undefined,
      })),
  )

  it('hay handlers de gestión que revisar', () => {
    expect(handlers.length).toBeGreaterThan(10)
  })

  it.each(INTEGRANTES)(
    '%s no tiene el permiso de ningún endpoint de gestión',
    (rol) => {
      const ability = definirAbilityPara({ rol })
      const abiertos = handlers.filter(
        ({ permiso }) =>
          permiso === 'sesion' ||
          (permiso !== undefined &&
            ability.can(permiso.accion, permiso.sujeto)),
      )
      expect(abiertos.map((h) => h.ruta)).toEqual([])
    },
  )

  const GETS_DE_SECCIONES = [
    `/api/secciones/${SECCION}/alumnos`,
    `/api/secciones/${SECCION}/ayudantes`,
    `/api/secciones/${SECCION}/horario`,
    `/api/cursos/${CURSO}`,
    `/api/cursos`,
    `/api/profesores`,
  ]

  describe.each(INTEGRANTES)('%s', (rol) => {
    it.each(GETS_DE_SECCIONES)('GET %s responde 403', async (ruta) => {
      await request(app.getHttpServer())
        .get(ruta)
        .set('Authorization', sesion(rol))
        .expect(403)
    })
  })
})

describe('GET /api/espacio/secciones/:id sin llegar a la base', () => {
  it('responde 401 sin sesión', async () => {
    await request(app.getHttpServer())
      .get(`/api/espacio/secciones/${SECCION}`)
      .expect(401)
  })

  it('responde 400 si el id no es un UUID', async () => {
    await request(app.getHttpServer())
      .get('/api/espacio/secciones/no-es-uuid')
      .set('Authorization', sesion('ALUMNO'))
      .expect(400)
  })

  it('responde 403 a un rol sin read Seccion', async () => {
    await request(app.getHttpServer())
      .get(`/api/espacio/secciones/${SECCION}`)
      .set(
        'Authorization',
        `Bearer ${jwt.sign({ sub: 'x', sid: 'y', universidad_id: 'z', rol: 'INVITADO' })}`,
      )
      .expect(403)
  })
})

describe('GET /api/espacio/secciones/:id/alumnos sin llegar a la base (ESP-05)', () => {
  it('responde 401 sin sesión', async () => {
    await request(app.getHttpServer())
      .get(`/api/espacio/secciones/${SECCION}/alumnos`)
      .expect(401)
  })

  it('responde 400 si el id no es un UUID', async () => {
    await request(app.getHttpServer())
      .get('/api/espacio/secciones/no-es-uuid/alumnos')
      .set('Authorization', sesion('PROFESOR'))
      .expect(400)
  })
})
