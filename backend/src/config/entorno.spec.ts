import { VARIABLES_API, validarEntorno } from './entorno.js'

const completo = {
  NODE_ENV: 'production',
  POSTGRES_HOST: 'bd.interna',
  POSTGRES_USER: 'cursus',
  POSTGRES_PASSWORD: 'valor-secreto',
  POSTGRES_DB: 'cursus_staging',
  ORIGIN_SECRET: 'otro-valor-secreto',
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
