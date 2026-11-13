import type {
  MetricasConsolidadas,
  MetricasFacultad,
  MetricasCarrera,
  DistribucionNotas,
  MetricasUniversidad,
  ReporteFacultad,
  ResumenUniversidad,
  Rol,
} from '@cursus/shared'
import { NotFoundException } from '@nestjs/common'
import type { INestApplication } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { vi } from 'vitest'
import type { App } from 'supertest/types.js'
import { AppModule } from '../../src/app.module.js'
import { AuthService } from '../../src/auth/auth.service.js'
import { configurarApp } from '../../src/config/configurar-app.js'
import { MetricasService } from '../../src/metricas/metricas.service.js'

// MET-01 sin PostgreSQL: sesión, CASL y la forma de la respuesta. El cálculo
// está en metricas.db-spec.ts.
const jwt = new JwtService({ secret: process.env.JWT_SECRET })
const sesion = (rol: Rol) =>
  `Bearer ${jwt.sign({
    sub: '00000000-0000-4000-8000-000000000001',
    sid: '00000000-0000-4000-8000-000000000003',
    universidad_id: '00000000-0000-4000-8000-000000000002',
    rol,
  })}`
const RUTA = '/api/metricas/consolidado'

const CONSOLIDADO: MetricasConsolidadas = {
  periodos: [{ universidad: 'Norte', anio: 2026, semestre: 2 }],
  aprobacion: { valor: 75, aprobados: 3, evaluados: 4 },
  promedio: { valor: 4.85, alumnos: 4 },
  asistencia: { valor: null, presentes: 0, registros: 0 },
  alumnos: 10,
  cursos: 3,
}

const UNIVERSIDAD = '00000000-0000-4000-8000-0000000000a1'
const RUTA_UNIVERSIDADES = '/api/metricas/universidades'
const META: MetricasUniversidad = {
  universidad: { id: UNIVERSIDAD, nombre: 'Norte' },
  periodo: { anio: 2026, semestre: 2 },
  facultades: [],
}
const REPORTE: ReporteFacultad = {
  facultad: { id: 'f-ingenieria', nombre: 'Ingeniería' },
  periodo: { anio: 2026, semestre: 2 },
  carreras: [],
}
const CARRERAS_REPORTE: MetricasFacultad = {
  universidad: { id: UNIVERSIDAD, nombre: 'Norte' },
  facultad: { id: 'f-ingenieria', nombre: 'Ingeniería' },
  periodo: { anio: 2026, semestre: 2 },
  carreras: [],
}
const CURSOS_REPORTE: MetricasCarrera = {
  universidad: { id: UNIVERSIDAD, nombre: 'Norte' },
  facultad: { id: 'f-ingenieria', nombre: 'Ingeniería' },
  carrera: { id: 'c-ingenieria', nombre: 'Ingeniería Civil' },
  periodo: { anio: 2026, semestre: 2 },
  cursos: [],
}
const DISTRIBUCION: DistribucionNotas = {
  universidad: { id: UNIVERSIDAD, nombre: 'Norte' },
  facultad: { id: 'f-ingenieria', nombre: 'Ingeniería' },
  carrera: { id: 'c-ingenieria', nombre: 'Ingeniería Civil' },
  curso: { id: UNIVERSIDAD, codigo: 'INF-101', nombre: 'Programación' },
  totalEvaluados: 2,
  notaMinimaAprobacion: 4,
  rangos: [
    { minimo: 1, maximo: 1.9, alumnos: 0 },
    { minimo: 2, maximo: 2.9, alumnos: 0 },
    { minimo: 3, maximo: 3.9, alumnos: 1 },
    { minimo: 4, maximo: 4.9, alumnos: 1 },
    { minimo: 5, maximo: 5.9, alumnos: 0 },
    { minimo: 6, maximo: 7, alumnos: 0 },
  ],
}
const consolidado = vi.fn(() => Promise.resolve(CONSOLIDADO))
const universidades = vi.fn(() => Promise.resolve([] as ResumenUniversidad[]))
const facultades = vi.fn((_c: unknown, id: string) =>
  id === UNIVERSIDAD
    ? Promise.resolve(META)
    : Promise.reject(new NotFoundException('La universidad no existe')),
)
const periodos = vi.fn(() =>
  Promise.resolve([
    { anio: 2026, semestre: 2, activo: true },
    { anio: 2026, semestre: 1, activo: false },
  ]),
)
const reporteFacultad = vi.fn(() => Promise.resolve(REPORTE))
const carrerasMetricas = vi.fn((_c: unknown, id: string) =>
  id === UNIVERSIDAD
    ? Promise.resolve(CARRERAS_REPORTE)
    : Promise.reject(new NotFoundException('La facultad no existe')),
)
const cursosMetricas = vi.fn((_c: unknown, id: string) =>
  id === UNIVERSIDAD
    ? Promise.resolve(CURSOS_REPORTE)
    : Promise.reject(new NotFoundException('La carrera no existe')),
)
const distribucionMetricas = vi.fn((_c: unknown, id: string) =>
  id === UNIVERSIDAD
    ? Promise.resolve(DISTRIBUCION)
    : Promise.reject(new NotFoundException('El curso no existe')),
)

let app: INestApplication<App>
beforeAll(async () => {
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(AuthService)
    .useValue({ sesionActiva: () => Promise.resolve(true) })
    .overrideProvider(MetricasService)
    .useValue({
      consolidado,
      universidades,
      facultades,
      periodos,
      reporteFacultad,
      carreras: carrerasMetricas,
      cursos: cursosMetricas,
      distribucion: distribucionMetricas,
    })
    .compile()
  app = modulo.createNestApplication<INestApplication<App>>({ logger: false })
  configurarApp(app, { secretoOrigen: '' })
  await app.init()
})
afterAll(async () => {
  await app?.close()
})

describe('GET /api/metricas/consolidado (MET-01)', () => {
  it('responde 401 sin sesión', async () => {
    await request(app.getHttpServer()).get(RUTA).expect(401)
  })

  it('el Director recibe los indicadores: 200', async () => {
    await request(app.getHttpServer())
      .get(RUTA)
      .set('Authorization', sesion('DIRECTOR'))
      .expect(200, CONSOLIDADO)
  })

  it.each<Rol>([
    'ADMINISTRATIVO',
    'PROFESOR',
    'AYUDANTE',
    'ALUMNO',
    'SUPERADMIN',
  ])('%s recibe 403: sin permiso CASL sobre Metricas', async (rol) => {
    await request(app.getHttpServer())
      .get(RUTA)
      .set('Authorization', sesion(rol))
      .expect(403)
  })

  it.each(['post', 'patch', 'delete'] as const)(
    'no hay ruta %s',
    async (metodo) => {
      await request(app.getHttpServer())
        [metodo](RUTA)
        .set('Authorization', sesion('DIRECTOR'))
        .expect(404)
    },
  )
})

describe('períodos de métricas (MET-03)', () => {
  it('solo el Director puede consultar los períodos disponibles', async () => {
    await request(app.getHttpServer())
      .get('/api/metricas/periodos')
      .set('Authorization', sesion('DIRECTOR'))
      .expect(200)
      .expect([
        { anio: 2026, semestre: 2, activo: true },
        { anio: 2026, semestre: 1, activo: false },
      ])
    expect(periodos).toHaveBeenCalled()
    await request(app.getHttpServer())
      .get('/api/metricas/periodos')
      .set('Authorization', sesion('PROFESOR'))
      .expect(403)
  })
})

describe('drill-down de universidad a facultad (MET-04)', () => {
  const facultadesDe = (id: string, consulta = '') =>
    `${RUTA_UNIVERSIDADES}/${id}/facultades${consulta}`

  it('el Director recibe las universidades y las facultades: 200', async () => {
    await request(app.getHttpServer())
      .get(RUTA_UNIVERSIDADES)
      .set('Authorization', sesion('DIRECTOR'))
      .expect(200, [])
    await request(app.getHttpServer())
      .get(facultadesDe(UNIVERSIDAD))
      .set('Authorization', sesion('DIRECTOR'))
      .expect(200, META)
  })

  it('pasa el período de la URL al servicio', async () => {
    await request(app.getHttpServer())
      .get(facultadesDe(UNIVERSIDAD, '?periodo=2026-1'))
      .set('Authorization', sesion('DIRECTOR'))
      .expect(200)
    expect(facultades).toHaveBeenLastCalledWith(
      expect.anything(),
      UNIVERSIDAD,
      { anio: 2026, semestre: 1 },
    )
  })

  it('una universidad inexistente responde 404', async () => {
    await request(app.getHttpServer())
      .get(facultadesDe('00000000-0000-4000-8000-0000000000ff'))
      .set('Authorization', sesion('DIRECTOR'))
      .expect(404)
  })

  it.each(['no-es-uuid'])('el id %s responde 400', async (id) => {
    await request(app.getHttpServer())
      .get(facultadesDe(id))
      .set('Authorization', sesion('DIRECTOR'))
      .expect(400)
  })

  it.each(['activo', '2026', '2026-x', '2026-0', '2026-99'])(
    'el período %s responde 400',
    async (periodo) => {
      await request(app.getHttpServer())
        .get(facultadesDe(UNIVERSIDAD, `?periodo=${periodo}`))
        .set('Authorization', sesion('DIRECTOR'))
        .expect(400)
    },
  )

  it('sin sesión, 401', async () => {
    await request(app.getHttpServer()).get(RUTA_UNIVERSIDADES).expect(401)
  })

  it.each<Rol>([
    'ADMINISTRATIVO',
    'PROFESOR',
    'AYUDANTE',
    'ALUMNO',
    'SUPERADMIN',
  ])('%s recibe 403 en ambos niveles', async (rol) => {
    for (const ruta of [RUTA_UNIVERSIDADES, facultadesDe(UNIVERSIDAD)]) {
      await request(app.getHttpServer())
        .get(ruta)
        .set('Authorization', sesion(rol))
        .expect(403)
    }
  })
})

describe('reporte de facultad (MET-08)', () => {
  it('el Administrativo recibe el reporte y solo acepta el período válido', async () => {
    await request(app.getHttpServer())
      .get('/api/metricas/facultad?periodo=2026-1')
      .set('Authorization', sesion('ADMINISTRATIVO'))
      .expect(200, REPORTE)
    expect(reporteFacultad).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.any(String),
      {
        anio: 2026,
        semestre: 1,
      },
    )
    for (const periodo of ['2026-0', '2026-99']) {
      await request(app.getHttpServer())
        .get(`/api/metricas/facultad?periodo=${periodo}`)
        .set('Authorization', sesion('ADMINISTRATIVO'))
        .expect(400)
    }
  })

  it('requiere sesión y el permiso específico del Administrativo', async () => {
    await request(app.getHttpServer()).get('/api/metricas/facultad').expect(401)
    for (const rol of ['DIRECTOR', 'PROFESOR', 'AYUDANTE', 'ALUMNO'] as Rol[]) {
      await request(app.getHttpServer())
        .get('/api/metricas/facultad')
        .set('Authorization', sesion(rol))
        .expect(403)
    }
  })
})

describe('carreras de una facultad (MET-05)', () => {
  const ruta = `/api/metricas/facultades/${UNIVERSIDAD}/carreras`

  it('el Director recibe las carreras y conserva el período', async () => {
    await request(app.getHttpServer())
      .get(`${ruta}?periodo=2026-1`)
      .set('Authorization', sesion('DIRECTOR'))
      .expect(200, CARRERAS_REPORTE)
    expect(carrerasMetricas).toHaveBeenLastCalledWith(
      expect.anything(),
      UNIVERSIDAD,
      { anio: 2026, semestre: 1 },
    )
  })

  it('responde 401, 403, 404 y 400 según corresponda', async () => {
    await request(app.getHttpServer()).get(ruta).expect(401)
    for (const rol of [
      'ADMINISTRATIVO',
      'PROFESOR',
      'AYUDANTE',
      'ALUMNO',
    ] as Rol[]) {
      await request(app.getHttpServer())
        .get(ruta)
        .set('Authorization', sesion(rol))
        .expect(403)
    }
    await request(app.getHttpServer())
      .get(
        '/api/metricas/facultades/00000000-0000-4000-8000-0000000000ff/carreras',
      )
      .set('Authorization', sesion('DIRECTOR'))
      .expect(404)
    await request(app.getHttpServer())
      .get('/api/metricas/facultades/no-es-uuid/carreras')
      .set('Authorization', sesion('DIRECTOR'))
      .expect(400)
  })
})

describe('cursos de una carrera (MET-06)', () => {
  const ruta = `/api/metricas/carreras/${UNIVERSIDAD}/cursos`

  it('el Director recibe los cursos y conserva el período', async () => {
    await request(app.getHttpServer())
      .get(`${ruta}?periodo=2026-1`)
      .set('Authorization', sesion('DIRECTOR'))
      .expect(200, CURSOS_REPORTE)
    expect(cursosMetricas).toHaveBeenLastCalledWith(
      expect.anything(),
      UNIVERSIDAD,
      { anio: 2026, semestre: 1 },
    )
  })

  it('responde 401, 403, 404 y 400 según corresponda', async () => {
    await request(app.getHttpServer()).get(ruta).expect(401)
    for (const rol of [
      'ADMINISTRATIVO',
      'PROFESOR',
      'AYUDANTE',
      'ALUMNO',
    ] as Rol[]) {
      await request(app.getHttpServer())
        .get(ruta)
        .set('Authorization', sesion(rol))
        .expect(403)
    }
    await request(app.getHttpServer())
      .get('/api/metricas/carreras/00000000-0000-4000-8000-0000000000ff/cursos')
      .set('Authorization', sesion('DIRECTOR'))
      .expect(404)
    await request(app.getHttpServer())
      .get('/api/metricas/carreras/no-es-uuid/cursos')
      .set('Authorization', sesion('DIRECTOR'))
      .expect(400)
  })
})

describe('distribución de notas (MET-07)', () => {
  const ruta = `/api/metricas/cursos/${UNIVERSIDAD}/distribucion`

  it('el Director recibe la distribución del curso', async () => {
    await request(app.getHttpServer())
      .get(ruta)
      .set('Authorization', sesion('DIRECTOR'))
      .expect(200, DISTRIBUCION)
    expect(distribucionMetricas).toHaveBeenLastCalledWith(
      expect.anything(),
      UNIVERSIDAD,
    )
  })

  it('responde 401, 403, 404, 400 y rechaza período', async () => {
    await request(app.getHttpServer()).get(ruta).expect(401)
    for (const rol of [
      'ADMINISTRATIVO',
      'PROFESOR',
      'AYUDANTE',
      'ALUMNO',
    ] as Rol[]) {
      await request(app.getHttpServer())
        .get(ruta)
        .set('Authorization', sesion(rol))
        .expect(403)
    }
    await request(app.getHttpServer())
      .get(
        '/api/metricas/cursos/00000000-0000-4000-8000-0000000000ff/distribucion',
      )
      .set('Authorization', sesion('DIRECTOR'))
      .expect(404)
    await request(app.getHttpServer())
      .get('/api/metricas/cursos/no-es-uuid/distribucion')
      .set('Authorization', sesion('DIRECTOR'))
      .expect(400)
    await request(app.getHttpServer())
      .get(`${ruta}?periodo=2026-1`)
      .set('Authorization', sesion('DIRECTOR'))
      .expect(400)
  })
})

describe('consolidado con período (MET-04)', () => {
  it('pasa el período de la URL al servicio, igual que los otros niveles', async () => {
    await request(app.getHttpServer())
      .get(`${RUTA}?periodo=2026-1`)
      .set('Authorization', sesion('DIRECTOR'))
      .expect(200, CONSOLIDADO)
    expect(consolidado).toHaveBeenLastCalledWith(expect.anything(), {
      anio: 2026,
      semestre: 1,
    })
  })

  it('sin período pide el activo', async () => {
    await request(app.getHttpServer())
      .get(RUTA)
      .set('Authorization', sesion('DIRECTOR'))
      .expect(200)
    expect(consolidado).toHaveBeenLastCalledWith(expect.anything(), null)
  })

  it.each(['activo', '2026', '2026-x', '2026-0', '2026-99'])(
    'el período %s responde 400',
    async (periodo) => {
      await request(app.getHttpServer())
        .get(`${RUTA}?periodo=${periodo}`)
        .set('Authorization', sesion('DIRECTOR'))
        .expect(400)
    },
  )
})
