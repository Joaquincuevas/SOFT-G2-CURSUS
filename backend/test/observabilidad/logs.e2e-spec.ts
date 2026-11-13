import {
  Controller,
  ForbiddenException,
  Get,
  HttpException,
  type INestApplication,
  Param,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { HealthController } from '../../src/health/health.controller.js'
import { HealthService } from '../../src/health/health.service.js'
import { configurarApp } from '../../src/config/configurar-app.js'
import { LoggerJson } from '../../src/observabilidad/logger-json.js'

// OBS-01 sin base: una app mínima con la misma configurarApp que main.ts, el
// logger JSON escribiendo en un arreglo y rutas que fallan o filtran datos.
const JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk0'
const REFRESH = 'q3Vw8kLz0aXb2Nn5Rt7Yc1Hd4Fg6Js9Mp-Ae_Ou8Wi'
const PASSWORD = 'Contraseña-Segura-123'
const RUT = '12.345.678-5'
const CORREO = 'ana.perez@norte.cursus.test'
const USUARIO = '3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b'

@Controller('prueba')
class PruebaController {
  @Get('salida')
  salida() {
    return { ok: true }
  }
  @Get('secciones/:id')
  seccion(@Param('id') id: string) {
    return { id }
  }
  @Get('prohibido')
  prohibido() {
    throw new ForbiddenException('No puedes ver esto')
  }
  @Get('falla')
  falla() {
    // Un error de verdad: el mensaje y el stack traen datos sensibles.
    throw new Error(
      `fallo con password=${PASSWORD}, ${JWT}, rut ${RUT}, ${CORREO} y refresh=${REFRESH}`,
    )
  }
  @Get('no-disponible')
  noDisponible() {
    throw new ServiceUnavailableException({
      status: 'error',
      database: 'error',
    })
  }
  @Get('http500')
  http500() {
    throw new HttpException('Falló algo con token=' + REFRESH, 500)
  }
  @Post('cuerpo')
  cuerpo() {
    return { ok: true }
  }
}

const lineas: string[] = []
const registros = () =>
  lineas.map((l) => JSON.parse(l) as Record<string, unknown>)
const accesos = () =>
  registros().filter((r) => r.message === 'solicitud atendida')
const salud = vi.fn()

const principal = new LoggerJson({
  nivel: 'info',
  entorno: 'staging',
  escribir: (l) => lineas.push(l),
})

let app: INestApplication<App>
beforeAll(async () => {
  const modulo = await Test.createTestingModule({
    controllers: [PruebaController, HealthController],
    providers: [
      { provide: HealthService, useValue: { baseDeDatosResponde: salud } },
    ],
  }).compile()
  app = modulo.createNestApplication<INestApplication<App>>()
  app.useLogger(principal)
  configurarApp(app, { secretoOrigen: '' })
  // Lo que deja JwtAuthGuard en una solicitud autenticada.
  app.use(
    (
      req: { usuario?: unknown; headers: Record<string, unknown> },
      _res: unknown,
      next: () => void,
    ) => {
      if (req.headers['x-prueba-usuario']) req.usuario = { sub: USUARIO }
      next()
    },
  )
  await app.init()
})
afterAll(() => app?.close())
beforeEach(() => {
  lineas.length = 0
  salud.mockReset().mockResolvedValue(true)
})

describe('línea de acceso', () => {
  it('es JSON con timestamp, level, requestId, método, ruta, status y duración', async () => {
    await request(app.getHttpServer()).get('/api/prueba/salida').expect(200)
    expect(accesos()).toHaveLength(1)
    const [linea] = accesos()
    expect(linea).toMatchObject({
      level: 'info',
      environment: 'staging',
      method: 'GET',
      route: '/api/prueba/salida',
      status: 200,
    })
    expect(new Date(linea.timestamp as string).toISOString()).toBe(
      linea.timestamp,
    )
    expect(typeof linea.durationMs).toBe('number')
    expect(linea.requestId).toMatch(/^[0-9a-f-]{36}$/)
    expect(linea.context).toBe('Acceso')
    // Sin sesión no hay usuario ni datos personales.
    expect(linea).not.toHaveProperty('usuarioId')
  })

  it('cada línea es JSON válido de una sola línea', async () => {
    await request(app.getHttpServer()).get('/api/prueba/falla')
    await request(app.getHttpServer()).get('/api/prueba/salida')
    expect(lineas.length).toBeGreaterThan(1)
    for (const linea of lineas) {
      expect(linea).not.toMatch(/[\r\n]/)
      const r = JSON.parse(linea) as Record<string, unknown>
      for (const campo of [
        'timestamp',
        'level',
        'message',
        'requestId',
        'environment',
      ])
        expect(r).toHaveProperty(campo)
    }
  })

  it('la ruta es el patrón: sin query string ni el valor del parámetro', async () => {
    await request(app.getHttpServer())
      .get(
        `/api/prueba/secciones/${USUARIO}?password=${PASSWORD}&token=${REFRESH}&correo=${CORREO}`,
      )
      .expect(200)
    const [linea] = accesos()
    expect(linea.route).toBe('/api/prueba/secciones/:id')
    const texto = JSON.stringify(registros())
    for (const x of [USUARIO, PASSWORD, REFRESH, CORREO, 'password='])
      expect(texto).not.toContain(x)
  })

  it('una ruta inexistente no escribe lo que mandó el cliente', async () => {
    await request(app.getHttpServer())
      .get(`/api/no-existe/${REFRESH}?token=${REFRESH}`)
      .expect(404)
    const [linea] = accesos()
    expect(linea).toMatchObject({
      route: '(sin ruta)',
      status: 404,
      level: 'warn',
    })
    expect(JSON.stringify(registros())).not.toContain(REFRESH)
  })

  it('los 4xx esperados salen en warn, sin stack', async () => {
    await request(app.getHttpServer()).get('/api/prueba/prohibido').expect(403)
    const [linea] = accesos()
    expect(linea).toMatchObject({ level: 'warn', status: 403 })
    expect(JSON.stringify(registros())).not.toContain('stack')
    expect(registros()).toHaveLength(1)
  })

  it('con la solicitud autenticada registra solo el id interno', async () => {
    await request(app.getHttpServer())
      .get('/api/prueba/salida')
      .set('x-prueba-usuario', '1')
    expect(accesos()[0].usuarioId).toBe(USUARIO)
    expect(JSON.stringify(registros())).not.toContain(CORREO)
  })

  it('no registra cuerpos ni cabeceras de la solicitud', async () => {
    await request(app.getHttpServer())
      .post('/api/prueba/cuerpo')
      .set('Authorization', `Bearer ${JWT}`)
      .set('Cookie', `refresh=${REFRESH}`)
      .send({
        password: PASSWORD,
        rut: RUT,
        correo: CORREO,
        codigo: '123456',
        desafio: JWT,
      })
      .expect(201)
    const texto = JSON.stringify(registros())
    for (const x of [JWT, REFRESH, PASSWORD, RUT, CORREO, '123456'])
      expect(texto).not.toContain(x)
  })
})

describe('requestId', () => {
  it('respeta un X-Request-Id válido y lo devuelve y lo registra', async () => {
    const respuesta = await request(app.getHttpServer())
      .get('/api/prueba/salida')
      .set('X-Request-Id', 'abc-12345-def')
      .expect(200)
    expect(respuesta.headers['x-request-id']).toBe('abc-12345-def')
    expect(accesos()[0].requestId).toBe('abc-12345-def')
  })

  it('genera uno cuando no viene y lo devuelve en la cabecera', async () => {
    const respuesta = await request(app.getHttpServer()).get(
      '/api/prueba/salida',
    )
    expect(respuesta.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/)
    expect(accesos()[0].requestId).toBe(respuesta.headers['x-request-id'])
  })

  it.each([
    ['con espacios y comillas', 'abc 123"; level=error'],
    ['muy largo', 'a'.repeat(200)],
    ['con caracteres raros', 'ñandú<script>x'],
    ['con una línea JSON falsa', '{"level":"error"}'],
    ['demasiado corto', 'x'],
  ])('reemplaza uno inválido (%s)', async (_caso, id) => {
    const respuesta = await request(app.getHttpServer())
      .get('/api/prueba/salida')
      .set('X-Request-Id', id)
    const devuelto = respuesta.headers['x-request-id']
    expect(devuelto).toMatch(/^[0-9a-f-]{36}$/)
    expect(accesos()[0].requestId).toBe(devuelto)
    expect(devuelto).not.toBe(id)
    expect(lineas.join('\n')).not.toContain(
      JSON.stringify(id).slice(1, -1) + '"',
    )
  })

  it('un salto de línea en la cabecera no parte el log', async () => {
    await request(app.getHttpServer())
      .get('/api/prueba/salida')
      .set('X-Request-Id', 'abc12345\\n{"level":"error","message":"falso"}')
    expect(lineas).toHaveLength(1)
    expect(registros()[0].message).toBe('solicitud atendida')
  })
})

describe('/health', () => {
  it('no genera ruido: ni /health ni /health/db al nivel info', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer()).get('/api/health').expect(200)
      await request(app.getHttpServer()).get('/api/health/db').expect(200)
    }
    expect(lineas).toEqual([])
  })

  it('con LOG_LEVEL=debug sí queda, en nivel debug', async () => {
    const aparte: string[] = []
    const modulo = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthService, useValue: { baseDeDatosResponde: salud } },
      ],
    }).compile()
    const otra = modulo.createNestApplication<INestApplication<App>>()
    otra.useLogger(
      new LoggerJson({ nivel: 'debug', escribir: (l) => aparte.push(l) }),
    )
    configurarApp(otra, { secretoOrigen: '' })
    await otra.init()
    await request(otra.getHttpServer()).get('/api/health').expect(200)
    await otra.close()
    // El logger de Nest es global: se devuelve el de las demás pruebas.
    app.useLogger(principal)
    const acceso = aparte
      .map((l) => JSON.parse(l) as Record<string, unknown>)
      .find((r) => r.message === 'solicitud atendida')
    expect(acceso).toMatchObject({
      level: 'debug',
      route: '/api/health',
      status: 200,
    })
  })

  it('un health que falla sí se registra (503 en error)', async () => {
    salud.mockResolvedValue(false)
    const respuesta = await request(app.getHttpServer())
      .get('/api/health/db')
      .expect(503)
    expect(respuesta.body).toEqual({ status: 'error', database: 'error' })
    expect(accesos()[0]).toMatchObject({ level: 'error', status: 503 })
  })
})

describe('errores 5xx', () => {
  it('un error no controlado se registra con requestId y ruta, sin datos sensibles, y la respuesta no cambia', async () => {
    const respuesta = await request(app.getHttpServer())
      .get('/api/prueba/falla')
      .set('X-Request-Id', 'busca-este-id-1')
      .expect(500)
    // Igual que el 500 por defecto de Nest; el id va en la cabecera.
    expect(respuesta.body).toEqual({
      statusCode: 500,
      message: 'Internal server error',
    })
    expect(respuesta.headers['x-request-id']).toBe('busca-este-id-1')
    const error = registros().find((r) => r.message === 'error del servidor')
    expect(error).toMatchObject({
      level: 'error',
      requestId: 'busca-este-id-1',
      method: 'GET',
      route: '/api/prueba/falla',
      status: 500,
      context: 'Excepciones',
    })
    const detalle = error?.error as Record<string, string>
    expect(detalle.name).toBe('Error')
    expect(detalle.stack).toContain('at ')
    const texto = lineas.join('\n')
    for (const x of [PASSWORD, JWT, RUT, CORREO, REFRESH])
      expect(texto).not.toContain(x)
  })

  it('un HttpException 5xx conserva su respuesta y se registra redactado', async () => {
    const respuesta = await request(app.getHttpServer())
      .get('/api/prueba/http500')
      .expect(500)
    expect(respuesta.body).toEqual({
      statusCode: 500,
      message: expect.stringContaining('Falló algo') as string,
    })
    expect(lineas.join('\n')).not.toContain(REFRESH)
    expect(registros().some((r) => r.message === 'error del servidor')).toBe(
      true,
    )
  })

  it('el cuerpo de un 503 no cambia', async () => {
    const respuesta = await request(app.getHttpServer())
      .get('/api/prueba/no-disponible')
      .expect(503)
    expect(respuesta.body).toEqual({ status: 'error', database: 'error' })
  })

  it('un 4xx no deja línea de error', async () => {
    await request(app.getHttpServer()).get('/api/prueba/prohibido').expect(403)
    expect(registros().some((r) => r.level === 'error')).toBe(false)
  })
})
