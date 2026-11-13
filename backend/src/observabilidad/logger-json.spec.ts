import { contextoSolicitud, requestIdDe } from './contexto-solicitud.js'
import { LoggerJson, nivelDesde } from './logger-json.js'

function capturar(opciones: ConstructorParameters<typeof LoggerJson>[0] = {}) {
  const lineas: string[] = []
  const logger = new LoggerJson({
    entorno: 'staging',
    escribir: (l) => lineas.push(l),
    ...opciones,
  })
  return {
    logger,
    lineas,
    json: () => lineas.map((l) => JSON.parse(l) as Record<string, unknown>),
  }
}

describe('LoggerJson', () => {
  it('escribe una línea JSON con timestamp ISO, nivel, entorno, contexto y mensaje', () => {
    const { logger, lineas, json } = capturar()
    logger.log('hola', 'MiServicio')
    expect(lineas).toHaveLength(1)
    const [linea] = json()
    expect(linea).toMatchObject({
      level: 'info',
      environment: 'staging',
      context: 'MiServicio',
      message: 'hola',
    })
    expect(new Date(linea.timestamp as string).toISOString()).toBe(
      linea.timestamp,
    )
  })

  it('incluye el requestId de la solicitud en curso, y solo ese', () => {
    const { logger, json } = capturar()
    logger.log('fuera')
    contextoSolicitud.run({ requestId: 'req-12345678' }, () =>
      logger.log('dentro'),
    )
    const [fuera, dentro] = json()
    expect(fuera).not.toHaveProperty('requestId')
    expect(dentro.requestId).toBe('req-12345678')
  })

  it('un mensaje con saltos de línea sigue siendo una sola línea', () => {
    const { logger, lineas } = capturar()
    logger.warn('uno\ndos\r\n{"level":"error","falso":true}')
    expect(lineas).toHaveLength(1)
    expect(lineas[0]).not.toMatch(/[\r\n]/)
    expect((JSON.parse(lineas[0]) as { level: string }).level).toBe('warn')
  })

  it('un campo del objeto no puede pisar timestamp, level, entorno ni requestId', () => {
    const { logger, json } = capturar()
    contextoSolicitud.run({ requestId: 'req-12345678' }, () =>
      logger.log({
        message: 'x',
        level: 'fatal',
        requestId: 'falso',
        environment: 'production',
        timestamp: '1970',
        status: 200,
      }),
    )
    expect(json()[0]).toMatchObject({
      level: 'info',
      requestId: 'req-12345678',
      environment: 'staging',
      status: 200,
    })
    expect(json()[0].timestamp).not.toBe('1970')
  })

  it('el stack de error() sale redactado', () => {
    const { logger, lineas } = capturar()
    logger.error(
      'falló',
      'Error: password=Contraseña-Segura-123\n    at x (/a.ts:1:1)',
      'Ctx',
    )
    expect(lineas[0]).not.toContain('Contraseña-Segura-123')
    expect(JSON.parse(lineas[0])).toMatchObject({
      context: 'Ctx',
      message: 'falló',
    })
  })

  it('las líneas de ruta mapeada del arranque de Nest bajan a debug', () => {
    const { logger, json } = capturar()
    logger.log('Mapped {/api/x, GET} route', 'RouterExplorer')
    logger.log('Nest application successfully started', 'NestApplication')
    expect(json().map((l) => l.context)).toEqual(['NestApplication'])
    const debug = capturar({ nivel: 'debug' })
    debug.logger.log('Mapped {/api/x, GET} route', 'RouterExplorer')
    expect(debug.json()[0].level).toBe('debug')
  })

  it('LOG_LEVEL filtra los niveles menos importantes', () => {
    const { logger, json } = capturar({ nivel: 'warn' })
    logger.error('e')
    logger.warn('w')
    logger.log('i')
    logger.debug('d')
    expect(json().map((l) => l.level)).toEqual(['error', 'warn'])
  })

  it('nivelDesde acepta niveles válidos y usa info si no', () => {
    expect(nivelDesde('DEBUG')).toBe('debug')
    expect(nivelDesde('log')).toBe('info')
    expect(nivelDesde(undefined)).toBe('info')
    expect(nivelDesde('ruidoso')).toBe('info')
  })
})

describe('requestIdDe', () => {
  const UUID =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
  it.each([
    'abcd1234',
    '3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b',
    'Root.1-abc_DEF',
    'a'.repeat(64),
  ])('respeta uno válido (%s)', (id) => expect(requestIdDe(id)).toBe(id))
  it.each([
    'corto',
    'a'.repeat(65),
    'con espacio 123',
    'linea\nfalsa{"level":"error"}',
    'a\r\nb1234567',
    '"; DROP TABLE x;--',
    '<script>alert(1)</script>',
    'ñandú12345',
    '',
    ['abcd1234', 'efgh5678'],
    undefined,
    123456789,
  ])('reemplaza uno inválido (%j)', (id) => {
    const nuevo = requestIdDe(id)
    expect(nuevo).toMatch(UUID)
    expect(nuevo).not.toBe(id)
  })
})
