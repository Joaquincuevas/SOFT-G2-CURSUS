import type { Request } from 'express'
import { ipLogin, normalizarIp } from './ip-login.js'

describe('IP de login', () => {
  it.each([
    ['127.0.0.1', '127.0.0.1'],
    ['::ffff:127.0.0.1', '127.0.0.1'],
    ['::ffff:7f00:1', '127.0.0.1'],
    ['2001:0db8:0000:0000:0000:0000:0000:0001', '2001:db8::1'],
    ['2001:db8::1', '2001:db8::1'],
    ['no-es-ip', null],
    ['fe80::1%eth0', null],
    ['1.2.3.4, 5.6.7.8', null],
    ['', null],
  ])('normaliza %s a %s', (entrada, salida) => {
    expect(normalizarIp(entrada)).toBe(salida)
  })

  it('ignora cabeceras enviadas por clientes directos en local', () => {
    const req = {
      socket: { remoteAddress: '::ffff:127.0.0.1' },
      headers: {
        'x-forwarded-for': '1.2.3.4',
        'x-vercel-forwarded-for': '5.6.7.8',
      },
    } as unknown as Request
    expect(ipLogin(req)).toBe('127.0.0.1')
  })
})
