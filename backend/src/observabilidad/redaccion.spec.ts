import { errorSeguro, redactar, redactarTexto, REDACTADO } from './redaccion.js'

// OBS-01: lo que no debe llegar a CloudWatch. Cada caso intenta filtrar un
// tipo de dato, en texto, en un objeto y en un error.
const JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk0'
const REFRESH = 'q3Vw8kLz0aXb2Nn5Rt7Yc1Hd4Fg6Js9Mp-Ae_Ou8Wi'
const RUTS = [
  '12.345.678-5',
  '12345678-5',
  '12.345.678-K',
  '9.876.543-2',
  '123456785',
  '12345678K',
]
const SECRETOS = [
  'Contraseña-Segura-123',
  JWT,
  REFRESH,
  '123456',
  'ana.perez@norte.cursus.test',
  ...RUTS,
]

const sinSecretos = (salida: unknown) => {
  const texto = JSON.stringify(salida)
  for (const secreto of SECRETOS) expect(texto).not.toContain(secreto)
}

describe('redactarTexto', () => {
  it.each([
    ['contraseña en JSON', '{"correo":"x","password":"Contraseña-Segura-123"}'],
    ['contraseña en query', 'GET /api/x?password=Contraseña-Segura-123&a=1'],
    ['contraseña nueva', 'passwordNueva: Contraseña-Segura-123'],
    ['JWT suelto', `falló la sesión ${JWT}`],
    ['Authorization', `Authorization: Bearer ${JWT}`],
    ['Bearer sin cabecera', `usó Bearer ${REFRESH}`],
    ['Cookie de refresh', `Cookie: refresh=${REFRESH}; otra=1`],
    [
      'enlace de recuperación',
      `https://cursus.test/recuperar-password#${REFRESH}`,
    ],
    ['token en query', `/api/auth/recuperar?token=${REFRESH}`],
    ['desafío MFA', `desafio=${JWT}`],
    ['código TOTP clave', 'codigo=123456'],
    ['código TOTP en JSON', '{"desafio":"x","codigo":"123456"}'],
    ['código TOTP en texto', 'el código TOTP 123456 no es válido'],
    ['correo', 'no existe ana.perez@norte.cursus.test'],
    ['token opaco largo', `hash ${REFRESH}`],
  ])('%s', (_caso, texto) => {
    const salida = redactarTexto(texto)
    sinSecretos(salida)
    expect(salida).toContain(REDACTADO)
  })

  it.each(RUTS)('RUT %s, con y sin puntos o guion', (rut) => {
    for (const texto of [
      rut,
      `alumno ${rut} no existe`,
      `rut=${rut}`,
      `{"rut":"${rut}"}`,
    ]) {
      expect(redactarTexto(texto)).not.toContain(rut)
    }
  })

  it('no toca lo que no es sensible: uuid, rutas, números y mensajes', () => {
    const texto =
      'solicitud 3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b en /api/secciones/:id tardó 12 ms, status 200'
    expect(redactarTexto(texto)).toBe(texto)
  })
})

describe('redactar', () => {
  it('redacta por clave en cualquier nivel, sin importar mayúsculas', () => {
    const salida = redactar({
      method: 'POST',
      body: {
        Password: 'Contraseña-Segura-123',
        passwordNueva: 'Contraseña-Segura-123',
        refreshToken: REFRESH,
        desafio: JWT,
        codigo: '123456',
        rut: '12.345.678-5',
        rutAlumno: '12345678-5',
        correo: 'ana.perez@norte.cursus.test',
        nested: [
          { authorization: `Bearer ${JWT}`, cookie: `refresh=${REFRESH}` },
        ],
        secreto: 'x',
      },
    })
    sinSecretos(salida)
    expect(salida).toMatchObject({ method: 'POST' })
  })

  it('conserva las claves parecidas que no son sensibles', () => {
    expect(
      redactar({ route: '/api/x/:id', status: 200, outputs: 1, ruta: 'a' }),
    ).toEqual({
      route: '/api/x/:id',
      status: 200,
      outputs: 1,
      ruta: 'a',
    })
  })

  // Un valor sin etiqueta ni formato reconocible: ningún patrón lo atrapa.
  const SINTETICO = 'zeta-valor-sintetico-91827'

  it('un error se registra sin su mensaje ni la primera línea del stack', () => {
    const error = Object.assign(
      new Error(
        `duplicate key value (${SINTETICO}) con password=Contraseña-Segura-123\nsegunda línea ${SINTETICO}`,
      ),
      {
        code: '23505',
        parameters: ['ana.perez@norte.cursus.test', 'Contraseña-Segura-123'],
        query: 'SELECT 1',
      },
    )
    error.stack = `Error: ${error.message}\n    at Servicio.hacer (/app/servicio.js:10:5)\n    at async Controlador.ir (/app/c.js:3:1)`
    const salida = redactar(error) as Record<string, unknown>
    expect(JSON.stringify(salida)).not.toContain(SINTETICO)
    sinSecretos(salida)
    expect(salida).toEqual({
      name: 'Error',
      code: '23505',
      stack:
        '    at Servicio.hacer (/app/servicio.js:10:5)\n    at async Controlador.ir (/app/c.js:3:1)',
    })
  })

  it('un código o un nombre de error con formato raro no se copia', () => {
    const error = Object.assign(new Error('x'), {
      code: `${SINTETICO} con espacios`,
    })
    error.name = `Nombre ${SINTETICO}`
    expect(errorSeguro(error)).toMatchObject({ name: 'Error' })
    expect(errorSeguro(error)).not.toHaveProperty('code')
    expect(errorSeguro('texto suelto ' + SINTETICO)).toEqual({
      name: 'ErrorDesconocido',
    })
  })

  it('no se cae con ciclos, profundidad, BigInt ni Buffer', () => {
    const a: Record<string, unknown> = { n: 1n, b: Buffer.from('secreto') }
    a.yo = a
    const salida = JSON.stringify(redactar(a))
    expect(salida).toContain('[CIRCULAR]')
    expect(salida).not.toContain('secreto')
  })
})
