import {
  cifrarSecretoTotp,
  descifrarSecretoTotp,
  llaveMfa,
} from './cifrado-mfa.js'
import { generarSecretoTotp } from './totp.js'

// SEG-01: el secreto TOTP se guarda cifrado.
const llave = llaveMfa('m'.repeat(32))
const USUARIO = '0b6c8f3e-5d6a-4b1e-9b3e-2f7d1c4a9e01'
const OTRO_USUARIO = '7f1e2d3c-4b5a-4968-8776-655443322110'
// Mismo patrón que ck_usuario... de la migración CrearMfaUsuario.
const FORMATO_BD =
  /^v1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{22}[.][A-Za-z0-9_-]+$/

describe('cifrado del secreto TOTP', () => {
  it('descifra lo que cifró, para el mismo usuario', () => {
    const secreto = generarSecretoTotp()
    const guardado = cifrarSecretoTotp(llave, USUARIO, secreto)
    expect(descifrarSecretoTotp(llave, USUARIO, guardado)).toBe(secreto)
  })

  it('no deja el secreto en claro y cumple el formato que exige la base', () => {
    const secreto = generarSecretoTotp()
    const guardado = cifrarSecretoTotp(llave, USUARIO, secreto)
    expect(guardado).toMatch(FORMATO_BD)
    expect(guardado).not.toContain(secreto)
    // El IV es aleatorio: el mismo secreto no se cifra dos veces igual.
    expect(cifrarSecretoTotp(llave, USUARIO, secreto)).not.toBe(guardado)
  })

  it('un secreto copiado a otro usuario no se descifra', () => {
    const guardado = cifrarSecretoTotp(llave, USUARIO, generarSecretoTotp())
    expect(() => descifrarSecretoTotp(llave, OTRO_USUARIO, guardado)).toThrow()
  })

  it('no se descifra con otra llave', () => {
    const guardado = cifrarSecretoTotp(llave, USUARIO, generarSecretoTotp())
    const otra = llaveMfa('n'.repeat(32))
    expect(() => descifrarSecretoTotp(otra, USUARIO, guardado)).toThrow()
  })

  it('detecta un texto alterado', () => {
    const guardado = cifrarSecretoTotp(llave, USUARIO, generarSecretoTotp())
    const [version, iv, tag, cifrado] = guardado.split('.')
    const alterado = `${cifrado.startsWith('A') ? 'B' : 'A'}${cifrado.slice(1)}`
    expect(() =>
      descifrarSecretoTotp(
        llave,
        USUARIO,
        [version, iv, tag, alterado].join('.'),
      ),
    ).toThrow()
  })

  it.each(['', 'GEZDGNBVGY3TQOJQ', 'v2.a.b.c', 'v1.a.b', 'v1.a.b.c.d'])(
    'rechaza el formato %j',
    (guardado) => {
      expect(() => descifrarSecretoTotp(llave, USUARIO, guardado)).toThrow()
    },
  )

  it('deriva una llave de 256 bits distinta del secreto de entorno', () => {
    expect(llave).toHaveLength(32)
    expect(llave.toString()).not.toContain('m'.repeat(32))
  })
})
