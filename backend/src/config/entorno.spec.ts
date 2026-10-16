import {
  duracionJwt,
  secretoJwt,
  VARIABLES_API,
  validarEntorno,
} from './entorno.js'

const completo = {
  NODE_ENV: 'production',
  POSTGRES_HOST: 'bd.interna',
  POSTGRES_USER: 'cursus',
  POSTGRES_PASSWORD: 'valor-secreto',
  POSTGRES_DB: 'cursus_staging',
  ORIGIN_SECRET: 'otro-valor-secreto',
  JWT_SECRET: 'x'.repeat(32),
}

describe('validarEntorno', () => {
  it('no exige variables fuera de producción', () => {
    expect(() =>
      validarEntorno(VARIABLES_API, { NODE_ENV: 'test' }),
    ).not.toThrow()
  })

  it('acepta producción con todas las variables', () => {
    expect(() => validarEntorno(VARIABLES_API, completo)).not.toThrow()
  })

  it('falla en producción y nombra las variables que faltan', () => {
    const incompleto = { ...completo, POSTGRES_PASSWORD: '', ORIGIN_SECRET: '' }
    expect(() => validarEntorno(VARIABLES_API, incompleto)).toThrow(
      'Faltan variables de entorno obligatorias: POSTGRES_PASSWORD, ORIGIN_SECRET',
    )
  })

  it('trata una variable vacía como faltante', () => {
    expect(() =>
      validarEntorno(VARIABLES_API, { ...completo, POSTGRES_HOST: '' }),
    ).toThrow('POSTGRES_HOST')
  })

  it('no incluye valores en el mensaje de error', () => {
    let mensaje = ''
    try {
      validarEntorno(VARIABLES_API, { ...completo, ORIGIN_SECRET: '' })
    } catch (error) {
      mensaje = String(error)
    }
    expect(mensaje).toContain('ORIGIN_SECRET')
    expect(mensaje).not.toContain('valor-secreto')
  })
})

describe('JWT_SECRET', () => {
  it('es obligatorio en producción', () => {
    expect(() =>
      validarEntorno(VARIABLES_API, { ...completo, JWT_SECRET: '' }),
    ).toThrow('JWT_SECRET')
  })

  it('exige al menos 32 caracteres en producción', () => {
    const corto = { ...completo, JWT_SECRET: 'secreto-corto-de-prueba' }
    expect(() => validarEntorno(VARIABLES_API, corto)).toThrow(
      'JWT_SECRET debe tener al menos 32 caracteres',
    )
  })

  it('no incluye el valor en el mensaje de error', () => {
    let mensaje = ''
    try {
      secretoJwt({ JWT_SECRET: 'secreto-corto-de-prueba' })
    } catch (error) {
      mensaje = String(error)
    }
    expect(mensaje).toContain('JWT_SECRET')
    expect(mensaje).not.toContain('secreto-corto-de-prueba')
  })

  it('se exige también fuera de producción para firmar tokens', () => {
    expect(() => secretoJwt({ NODE_ENV: 'development' })).toThrow('JWT_SECRET')
    expect(secretoJwt({ JWT_SECRET: 'x'.repeat(32) })).toBe('x'.repeat(32))
  })
})

describe('duracionJwt', () => {
  it('usa 15 minutos por defecto', () => {
    expect(duracionJwt({})).toBe('15m')
    expect(duracionJwt({ JWT_EXPIRES_IN: '5m' })).toBe('5m')
  })
})
