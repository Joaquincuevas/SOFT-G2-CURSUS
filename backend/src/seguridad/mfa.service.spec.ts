import { ServiceUnavailableException } from '@nestjs/common'
import type { BaseDeDatos } from '../database/base-de-datos.service.js'
import { MfaService } from './mfa.service.js'

// SEG-01. Sin MFA_SECRET la API arranca igual (como S3 sin bucket), pero no
// genera ni confirma secretos: no podría cifrarlos ni descifrarlos.
describe('MfaService sin MFA_SECRET', () => {
  const original = process.env.MFA_SECRET
  let query: ReturnType<typeof vi.fn>
  let servicio: MfaService

  beforeEach(() => {
    delete process.env.MFA_SECRET
    query = vi.fn().mockResolvedValue([])
    servicio = new MfaService({ query } as unknown as BaseDeDatos)
  })

  afterEach(() => {
    process.env.MFA_SECRET = original
  })

  it('responde 503 al generar el QR, sin tocar la base', async () => {
    await expect(servicio.iniciar('usuario')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    )
    expect(query).not.toHaveBeenCalled()
  })

  it('responde 503 al confirmar, sin tocar la base', async () => {
    await expect(
      servicio.confirmar('usuario', '123456'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(query).not.toHaveBeenCalled()
  })

  it('el estado sigue respondiendo', async () => {
    await expect(servicio.estado('usuario')).resolves.toEqual({
      activo: false,
    })
  })
})

describe('MfaService con un MFA_SECRET corto', () => {
  it('falla al crearse, para que la API no arranque con una llave débil', () => {
    const original = process.env.MFA_SECRET
    process.env.MFA_SECRET = 'corto'
    try {
      expect(() => new MfaService({} as BaseDeDatos)).toThrow('MFA_SECRET')
    } finally {
      process.env.MFA_SECRET = original
    }
  })
})
