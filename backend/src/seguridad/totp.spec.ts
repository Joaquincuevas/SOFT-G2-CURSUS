import {
  aBase32,
  codigoTotp,
  desdeBase32,
  generarSecretoTotp,
  pasoDe,
  pasoDelCodigo,
  uriTotp,
} from './totp.js'

// SEG-01. Secreto de los vectores de prueba de la RFC 6238 (apéndice B) para
// SHA1: los 20 bytes ASCII de "12345678901234567890".
const SECRETO_RFC = aBase32(Buffer.from('12345678901234567890'))

describe('base32 (RFC 4648)', () => {
  it('codifica los vectores de la RFC sin relleno', () => {
    expect(aBase32(Buffer.from(''))).toBe('')
    expect(aBase32(Buffer.from('f'))).toBe('MY')
    expect(aBase32(Buffer.from('foobar'))).toBe('MZXW6YTBOI')
    expect(SECRETO_RFC).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ')
  })

  it('decodifica lo que escribiría una persona: minúsculas, espacios y relleno', () => {
    expect(desdeBase32('mzxw 6ytb oi======').toString()).toBe('foobar')
  })

  it('rechaza caracteres fuera del alfabeto', () => {
    expect(() => desdeBase32('MZXW1')).toThrow('base32')
  })
})

describe('códigos TOTP', () => {
  // Los vectores son de 8 dígitos; con 6 se toman los últimos seis.
  it.each([
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
    [20000000000, '353130'],
  ])('en t=%i genera %s, como la RFC 6238', (segundos, codigo) => {
    expect(codigoTotp(SECRETO_RFC, segundos * 1000)).toBe(codigo)
  })

  it('genera secretos de 160 bits en base32, distintos cada vez', () => {
    const uno = generarSecretoTotp()
    expect(uno).toMatch(/^[A-Z2-7]{32}$/)
    expect(desdeBase32(uno)).toHaveLength(20)
    expect(generarSecretoTotp()).not.toBe(uno)
  })
})

describe('pasoDelCodigo', () => {
  const ahora = 1111111111 * 1000
  const paso = pasoDe(ahora)

  it('acepta el código del paso actual y devuelve ese paso', () => {
    expect(
      pasoDelCodigo(SECRETO_RFC, codigoTotp(SECRETO_RFC, ahora), ahora),
    ).toBe(paso)
  })

  it('tolera un paso de diferencia con el reloj del teléfono', () => {
    const antes = codigoTotp(SECRETO_RFC, ahora - 30_000)
    const despues = codigoTotp(SECRETO_RFC, ahora + 30_000)
    expect(pasoDelCodigo(SECRETO_RFC, antes, ahora)).toBe(paso - 1)
    expect(pasoDelCodigo(SECRETO_RFC, despues, ahora)).toBe(paso + 1)
  })

  it('rechaza un código de hace dos pasos o más', () => {
    const viejo = codigoTotp(SECRETO_RFC, ahora - 60_000)
    expect(pasoDelCodigo(SECRETO_RFC, viejo, ahora)).toBeNull()
  })

  it('rechaza un código de otro secreto', () => {
    const otro = generarSecretoTotp()
    expect(
      pasoDelCodigo(otro, codigoTotp(SECRETO_RFC, ahora), ahora),
    ).toBeNull()
  })

  it.each(['', '12345', '1234567', '12345a', ' 050471', '０５０４７１'])(
    'rechaza el formato %j sin comparar',
    (codigo) => {
      expect(pasoDelCodigo(SECRETO_RFC, codigo, ahora)).toBeNull()
    },
  )
})

describe('uriTotp', () => {
  it('arma la Key Uri que leen Google Authenticator y Authy', () => {
    const uri = new URL(uriTotp('ana+mfa@norte.cursus.test', SECRETO_RFC))
    expect(uri.protocol).toBe('otpauth:')
    expect(uri.host).toBe('totp')
    expect(decodeURIComponent(uri.pathname)).toBe(
      '/CURSUS:ana+mfa@norte.cursus.test',
    )
    expect(Object.fromEntries(uri.searchParams)).toEqual({
      secret: SECRETO_RFC,
      issuer: 'CURSUS',
      algorithm: 'SHA1',
      digits: '6',
      period: '30',
    })
  })
})
