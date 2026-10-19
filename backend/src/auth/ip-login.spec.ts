import type { Request } from 'express'
import { Logger } from '@nestjs/common'
import { vi } from 'vitest'
import {
  ipLogin,
  normalizarIp,
  ORIGEN_VERIFICADO,
  type RequestLogin,
} from './ip-login.js'

describe('IP de login', () => {
  it.each([undefined, '', '  '])(
    'sin cabecera confiable (%s), registra aviso sin datos del cliente y omite la IP',
    (cabecera) => {
      const warn = vi
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => {})
      try {
        const req = {
          [ORIGEN_VERIFICADO]: true,
          headers: {
            'x-vercel-forwarded-for': cabecera,
            'x-forwarded-for': '192.0.2.200',
          },
          socket: { remoteAddress: '10.0.0.1' },
        } as unknown as RequestLogin
        expect(ipLogin(req)).toBeNull()
        expect(warn).toHaveBeenCalledWith(
          'Login sin x-vercel-forwarded-for: se aplica solo el límite por cuenta',
        )
      } finally {
        warn.mockRestore()
      }
    },
  )
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
