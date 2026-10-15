import { ServiceUnavailableException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { HealthController } from './health.controller.js'
import { HealthService } from './health.service.js'

describe('HealthController', () => {
  const healthService = { baseDeDatosResponde: vi.fn<() => Promise<boolean>>() }
  let controller: HealthController

  beforeEach(async () => {
    healthService.baseDeDatosResponde.mockReset()
    const modulo = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: healthService }],
    }).compile()

    controller = modulo.get(HealthController)
  })

  it('responde ok sin consultar la base de datos', () => {
    expect(controller.vivo()).toEqual({ status: 'ok' })
    expect(healthService.baseDeDatosResponde).not.toHaveBeenCalled()
  })

  it('responde ok en /db cuando la base de datos responde', async () => {
    healthService.baseDeDatosResponde.mockResolvedValue(true)
    await expect(controller.baseDeDatos()).resolves.toEqual({
      status: 'ok',
      database: 'ok',
    })
  })

  it('responde 503 en /db cuando la base de datos no responde', async () => {
    healthService.baseDeDatosResponde.mockResolvedValue(false)
    await expect(controller.baseDeDatos()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    )
  })
})
