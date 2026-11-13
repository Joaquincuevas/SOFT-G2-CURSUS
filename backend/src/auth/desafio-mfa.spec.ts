import { JwtService } from '@nestjs/jwt'
import {
  firmarDesafioMfa,
  huellaCredencial,
  leerDesafioMfa,
} from './desafio-mfa.js'

// SEG-02: el desafío del paso 1 no es un token de sesión y viceversa.
describe('desafío del login con MFA', () => {
  const original = process.env.JWT_SECRET
  const jwt = new JwtService({
    secret: 'secreto-de-sesion-solo-para-tests-0123456789',
  })

  beforeEach(() => {
    process.env.JWT_SECRET = 'secreto-de-sesion-solo-para-tests-0123456789'
  })
  afterEach(() => {
    process.env.JWT_SECRET = original
  })

  it('se firma y se lee con la cuenta y el último paso', async () => {
    const token = await firmarDesafioMfa(jwt, {
      usuarioId: 'u1',
      ultimoPaso: 7,
      credencial: 'huella',
    })
    expect(await leerDesafioMfa(jwt, token)).toEqual({
      usuarioId: 'u1',
      ultimoPaso: 7,
      credencial: 'huella',
    })
    const nuevo = await firmarDesafioMfa(jwt, {
      usuarioId: 'u1',
      ultimoPaso: null,
      credencial: 'huella',
    })
    expect(await leerDesafioMfa(jwt, nuevo)).toEqual({
      usuarioId: 'u1',
      ultimoPaso: null,
      credencial: 'huella',
    })
  })

  it('no trae rol, universidad ni sesión', async () => {
    const token = await firmarDesafioMfa(jwt, {
      usuarioId: 'u1',
      ultimoPaso: null,
      credencial: 'huella',
    })
    const cuerpo = JSON.parse(
      Buffer.from(token.split('.')[1], 'base64url').toString(),
    ) as Record<string, unknown>
    expect(Object.keys(cuerpo).sort()).toEqual([
      'cv',
      'exp',
      'iat',
      'prop',
      'sub',
      'up',
    ])
  })

  it('no se verifica con la llave de sesión: JwtAuthGuard lo rechaza', async () => {
    const token = await firmarDesafioMfa(jwt, {
      usuarioId: 'u1',
      ultimoPaso: null,
      credencial: 'huella',
    })
    await expect(jwt.verifyAsync(token)).rejects.toThrow()
  })

  it('un JWT de sesión no pasa como desafío', async () => {
    const sesion = await jwt.signAsync({
      sub: 'u1',
      sid: 's1',
      rol: 'ALUMNO',
      universidad_id: 'x',
    })
    expect(await leerDesafioMfa(jwt, sesion)).toBeNull()
    const conLaLlaveDeSesion = await jwt.signAsync({
      sub: 'u1',
      prop: 'mfa',
      up: null,
    })
    expect(await leerDesafioMfa(jwt, conLaLlaveDeSesion)).toBeNull()
  })

  it('la huella de la credencial cambia con el hash y no lo revela', () => {
    const a = huellaCredencial('$argon2id$v=19$hash-a')
    expect(a).toBe(huellaCredencial('$argon2id$v=19$hash-a'))
    expect(a).not.toBe(huellaCredencial('$argon2id$v=19$hash-b'))
    expect(a).not.toContain('argon2')
  })

  it('expirado, manipulado o con un paso inválido se rechaza', async () => {
    const vencido = await firmarDesafioMfa(
      jwt,
      { usuarioId: 'u1', ultimoPaso: null, credencial: 'huella' },
      '-1s',
    )
    expect(await leerDesafioMfa(jwt, vencido)).toBeNull()
    const token = await firmarDesafioMfa(jwt, {
      usuarioId: 'u1',
      ultimoPaso: null,
      credencial: 'huella',
    })
    expect(await leerDesafioMfa(jwt, `${token}x`)).toBeNull()
    expect(await leerDesafioMfa(jwt, 'basura')).toBeNull()
    const pasoInvalido = await firmarDesafioMfa(jwt, {
      usuarioId: 'u1',
      ultimoPaso: -1,
    })
    expect(await leerDesafioMfa(jwt, pasoInvalido)).toBeNull()
  })
})
