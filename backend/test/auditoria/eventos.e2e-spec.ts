import type { PaginaEventos, Rol } from '@cursus/shared'
import type { INestApplication } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { vi } from 'vitest'
import { AppModule } from '../../src/app.module.js'
import { AuditoriaService } from '../../src/auditoria/auditoria.service.js'
import { AuthService } from '../../src/auth/auth.service.js'
import { configurarApp } from '../../src/config/configurar-app.js'

// SEG-05 sin PostgreSQL: sesión, CASL (solo el Director) y la validación de la
// query. La lectura contra la base está en eventos.db-spec.ts.
const jwt = new JwtService({ secret: process.env.JWT_SECRET })
const sesion = (rol: Rol) =>
  `Bearer ${jwt.sign({
    sub: '00000000-0000-4000-8000-000000000001',
    sid: '00000000-0000-4000-8000-000000000003',
    universidad_id: '00000000-0000-4000-8000-000000000002',
    rol,
  })}`
const RUTA = '/api/auditoria/eventos'
const PAGINA: PaginaEventos = { total: 0, pagina: 1, tamano: 25, eventos: [] }
const eventos = vi.fn(() => Promise.resolve(PAGINA))
const universidades = vi.fn(() =>
  Promise.resolve([{ id: 'u', nombre: 'Norte' }]),
)

let app: INestApplication<App>
beforeAll(async () => {
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(AuthService)
    .useValue({ sesionActiva: () => Promise.resolve(true) })
    .overrideProvider(AuditoriaService)
    .useValue({ eventos, universidades })
    .compile()
  app = modulo.createNestApplication<INestApplication<App>>({ logger: false })
  configurarApp(app)
  await app.init()
})
afterAll(() => app?.close())
beforeEach(() => eventos.mockClear())

const pedir = (rol: Rol, consulta = '') =>
  request(app.getHttpServer())
    .get(`${RUTA}${consulta}`)
    .set('Authorization', sesion(rol))

describe('GET /api/auditoria/eventos (SEG-05)', () => {
  it('el Director consulta y recibe la página', async () => {
    const respuesta = await pedir('DIRECTOR').expect(200)
    expect(respuesta.body).toEqual(PAGINA)
    expect(eventos).toHaveBeenCalledTimes(1)
  })

  it.each([
    'ADMINISTRATIVO',
    'PROFESOR',
    'AYUDANTE',
    'ALUMNO',
    'SUPERADMIN',
  ] as Rol[])('%s recibe 403 sin llegar al servicio', async (rol) => {
    await pedir(rol).expect(403)
    expect(eventos).not.toHaveBeenCalled()
  })

  it('las opciones del filtro de universidad son solo del Director', async () => {
    const ruta = '/api/auditoria/universidades'
    await request(app.getHttpServer())
      .get(ruta)
      .set('Authorization', sesion('DIRECTOR'))
      .expect(200, [{ id: 'u', nombre: 'Norte' }])
    for (const rol of ['ADMINISTRATIVO', 'PROFESOR', 'SUPERADMIN'] as Rol[]) {
      await request(app.getHttpServer())
        .get(ruta)
        .set('Authorization', sesion(rol))
        .expect(403)
    }
    expect(universidades).toHaveBeenCalledTimes(1)
  })

  it('sin sesión responde 401', async () => {
    await request(app.getHttpServer()).get(RUTA).expect(401)
  })

  it('pasa los filtros validados y convierte la página y el tamaño a número', async () => {
    const usuarioId = '00000000-0000-4000-8000-0000000000a1'
    await pedir(
      'DIRECTOR',
      `?usuarioId=${usuarioId}&tipo=CIERRE_CURSO&pagina=2&tamano=10&desde=2026-10-01T00:00:00Z`,
    ).expect(200)
    expect(eventos.mock.calls[0]).toEqual([
      expect.objectContaining({ rol: 'DIRECTOR' }),
      {
        usuarioId,
        tipo: 'CIERRE_CURSO',
        pagina: 2,
        tamano: 10,
        desde: '2026-10-01T00:00:00Z',
      },
    ])
  })

  it.each([
    'tamano=101',
    'pagina=0',
    'tipo=OTRO',
    'usuarioId=x',
    'desde=2026-10-01',
    'hasta=2026-10-01T00:00:00',
    'desde=2026-10-02T00:00:00Z&hasta=2026-10-01T00:00:00Z',
    'universidadIdDeOtro=1',
  ])('rechaza %s con 400', async (consulta) => {
    await pedir('DIRECTOR', `?${consulta}`).expect(400)
    expect(eventos).not.toHaveBeenCalled()
  })
})
