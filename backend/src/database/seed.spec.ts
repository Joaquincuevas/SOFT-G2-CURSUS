import { verificarEntorno } from './seed.js'

describe('verificarEntorno', () => {
  it('permite correr el seed fuera de producción', () => {
    expect(() => verificarEntorno({ NODE_ENV: 'development' })).not.toThrow()
    expect(() => verificarEntorno({})).not.toThrow()
  })

  it('bloquea el seed en producción', () => {
    expect(() => verificarEntorno({ NODE_ENV: 'production' })).toThrow(
      /SEED_ALLOW=true/,
    )
  })

  it('permite producción solo con SEED_ALLOW=true', () => {
    expect(() =>
      verificarEntorno({ NODE_ENV: 'production', SEED_ALLOW: 'true' }),
    ).not.toThrow()
    expect(() =>
      verificarEntorno({ NODE_ENV: 'production', SEED_ALLOW: '1' }),
    ).toThrow()
  })
})
