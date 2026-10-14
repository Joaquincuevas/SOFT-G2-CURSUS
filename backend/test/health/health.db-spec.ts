import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { AppModule } from '../../src/app.module.js'
import { configurarApp } from '../../src/config/configurar-app.js'

async function crearApp(): Promise<INestApplication<App>> {
  const modulo = await Test.createTestingModule({
    imports: [AppModule],
  }).compile()
  const app = modulo.createNestApplication<INestApplication<App>>({
    logger: false,
  })
  configurarApp(app, { secretoOrigen: '' })
  await app.init()
  return app
}

describe('GET /api/health/db', () => {
  it('responde 200 cuando la base de datos responde', async () => {
    const app = await crearApp()
    try {
      await request(app.getHttpServer())
        .get('/api/health/db')
        .expect(200, { status: 'ok', database: 'ok' })
    } finally {
      await app.close()
    }
  })

  it('responde 503 cuando la base de datos no responde', async () => {
    const puertoOriginal = process.env.POSTGRES_PORT
    // Puerto sin ningún servicio escuchando: la conexión se rechaza.
    process.env.POSTGRES_PORT = '1'
    const app = await crearApp()
    try {
      await request(app.getHttpServer())
        .get('/api/health/db')
        .expect(503, { status: 'error', database: 'error' })
      // /api/health sigue respondiendo aunque la base no esté disponible.
      await request(app.getHttpServer())
        .get('/api/health')
        .expect(200, { status: 'ok' })
    } finally {
      await app.close()
      process.env.POSTGRES_PORT = puertoOriginal
    }
  })
})
