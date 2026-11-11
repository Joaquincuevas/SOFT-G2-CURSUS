import type { INestApplication } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { AppModule } from '../../src/app.module.js'
import { AuthService } from '../../src/auth/auth.service.js'
import { configurarApp } from '../../src/config/configurar-app.js'

// Tokens firmados como los del backend (mismo secreto que vitest.config.e2e.ts),
// con una sesión que se da por activa (ver permisos.e2e-spec.ts). PermisosGuard
// responde antes de tocar la base; lo que necesita la base (ser integrante,
// validar el body, firmar) está en archivos.db-spec.ts.
const jwt = new JwtService({ secret: process.env.JWT_SECRET })
const sesionDe = (rol: string) =>
  `Bearer ${jwt.sign({
    sub: '00000000-0000-0000-0000-000000000001',
    sid: '00000000-0000-0000-0000-000000000003',
    rol,
    universidad_id: '00000000-0000-0000-0000-000000000002',
  })}`

const RUTA =
  '/api/espacio/secciones/00000000-0000-4000-8000-000000000005/archivos'
const ARCHIVO = '00000000-0000-4000-8000-000000000006'
const BODY = { nombre: 'guia.pdf', tamano: 10 }

describe('archivos (e2e)', () => {
  let app: INestApplication<App>

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AuthService)
      .useValue({ sesionActiva: () => Promise.resolve(true) })
      .compile()
    app = modulo.createNestApplication<INestApplication<App>>({
      logger: false,
    })
    configurarApp(app, { secretoOrigen: '' })
    await app.init()
  })

  afterAll(async () => {
    await app?.close()
  })

  it.each(['ADMINISTRATIVO', 'DIRECTOR'])(
    '%s recibe 403 al pedir o confirmar una subida',
    async (rol) => {
      await request(app.getHttpServer())
        .post(RUTA)
        .set('Authorization', sesionDe(rol))
        .send(BODY)
        .expect(403)
      await request(app.getHttpServer())
        .post(`${RUTA}/${ARCHIVO}/confirmar`)
        .set('Authorization', sesionDe(rol))
        .expect(403)
    },
  )

  it('el Administrativo recibe 403 al descargar', async () => {
    await request(app.getHttpServer())
      .get(`${RUTA}/${ARCHIVO}/descarga`)
      .set('Authorization', sesionDe('ADMINISTRATIVO'))
      .expect(403)
  })

  it('responde 401 sin sesión', async () => {
    await request(app.getHttpServer()).post(RUTA).send(BODY).expect(401)
    await request(app.getHttpServer())
      .post(`${RUTA}/${ARCHIVO}/confirmar`)
      .expect(401)
    await request(app.getHttpServer())
      .get(`${RUTA}/${ARCHIVO}/descarga`)
      .expect(401)
  })

  it('no acepta DELETE: nada se elimina', async () => {
    await request(app.getHttpServer())
      .delete(`${RUTA}/${ARCHIVO}`)
      .set('Authorization', sesionDe('PROFESOR'))
      .expect(404)
  })

  it('responde 400 con una sección que no es uuid', async () => {
    await request(app.getHttpServer())
      .post('/api/espacio/secciones/no-es-uuid/archivos')
      .set('Authorization', sesionDe('ALUMNO'))
      .send(BODY)
      .expect(400)
  })
})
