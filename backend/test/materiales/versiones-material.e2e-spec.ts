import type { Rol, SeccionEspacio, VersionMaterial } from '@cursus/shared'
import { ConflictException, type INestApplication } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { vi } from 'vitest'
import { AppModule } from '../../src/app.module.js'
import { AuthService } from '../../src/auth/auth.service.js'
import { configurarApp } from '../../src/config/configurar-app.js'
import { AccesoSeccionService } from '../../src/espacio/acceso-seccion.service.js'
import { MaterialesService } from '../../src/materiales/materiales.service.js'

// MAT-07 sin PostgreSQL: sesión, CASL, rol en la sección, validación y
// respuestas. La RLS y la numeración se prueban en materiales.db-spec.ts. En
// COMO_AYUDANTE la cuenta de profesor es ayudante.
const jwt = new JwtService({ secret: process.env.JWT_SECRET })
const sesion = (rol: Rol) =>
  `Bearer ${jwt.sign({
    sub: '00000000-0000-4000-8000-000000000001',
    sid: '00000000-0000-4000-8000-000000000003',
    universidad_id: '00000000-0000-4000-8000-000000000002',
    rol,
  })}`
const SECCION = '00000000-0000-4000-8000-000000000010'
const COMO_AYUDANTE = '00000000-0000-4000-8000-000000000011'
const MATERIAL = '00000000-0000-4000-8000-000000000020'
const ARCHIVO = '00000000-0000-4000-8000-000000000030'
const USADO = '00000000-0000-4000-8000-000000000031'
const ruta = (seccion = SECCION, resto = '') =>
  `/api/espacio/secciones/${seccion}/materiales/${MATERIAL}/versiones${resto}`

const VERSION: VersionMaterial = {
  version: 2,
  archivo: {
    id: ARCHIVO,
    nombre: 'v2.pdf',
    tipo: 'application/pdf',
    tamano: 10,
    subidoEn: '2026-11-11T12:00:00.000Z',
  },
  subidoEn: '2026-11-11T12:00:00.000Z',
  responsable: 'Profesora',
}
const subirVersion = vi.fn(
  (_c: unknown, _u: string, _s: unknown, _m: string, archivoId: string) =>
    archivoId === USADO
      ? Promise.reject(new ConflictException('El archivo ya es un material'))
      : Promise.resolve(VERSION),
)
const versiones = vi.fn(() => Promise.resolve([VERSION]))
const descargaVersion = vi.fn(() =>
  Promise.resolve({ url: 'https://s3.test/x', expiraEn: '' }),
)

let app: INestApplication<App>
beforeAll(async () => {
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(AuthService)
    .useValue({ sesionActiva: () => Promise.resolve(true) })
    .overrideProvider(AccesoSeccionService)
    .useValue({
      verificar: (contexto: { rol: Rol }, _: string, id: string) =>
        Promise.resolve({
          id,
          rol: id === COMO_AYUDANTE ? 'AYUDANTE' : contexto.rol,
        } as SeccionEspacio),
    })
    .overrideProvider(MaterialesService)
    .useValue({ subirVersion, versiones, descargaVersion })
    .compile()
  app = modulo.createNestApplication<INestApplication<App>>({ logger: false })
  configurarApp(app, { secretoOrigen: '' })
  await app.init()
})
afterAll(async () => {
  await app?.close()
})

describe('versiones de un material (MAT-07)', () => {
  it('el profesor sube una versión nueva: 201', async () => {
    const respuesta = await request(app.getHttpServer())
      .post(ruta())
      .set('Authorization', sesion('PROFESOR'))
      .send({ archivoId: ARCHIVO })
      .expect(201)
    expect(respuesta.body).toEqual(VERSION)
    expect(subirVersion).toHaveBeenLastCalledWith(
      expect.anything(),
      '00000000-0000-4000-8000-000000000001',
      expect.objectContaining({ id: SECCION }),
      MATERIAL,
      ARCHIVO,
    )
  })

  it('el profesor lee el historial y descarga una versión: 200', async () => {
    await request(app.getHttpServer())
      .get(ruta())
      .set('Authorization', sesion('PROFESOR'))
      .expect(200, [VERSION])
    await request(app.getHttpServer())
      .get(ruta(SECCION, '/1/descarga'))
      .set('Authorization', sesion('PROFESOR'))
      .expect(200)
    expect(descargaVersion).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.any(String),
      expect.anything(),
      MATERIAL,
      1,
    )
  })

  it.each([
    ['sin archivoId', {}],
    ['con un archivoId que no es UUID', { archivoId: 'x' }],
  ])('400 %s', async (_q, body) => {
    subirVersion.mockClear()
    await request(app.getHttpServer())
      .post(ruta())
      .set('Authorization', sesion('PROFESOR'))
      .send(body)
      .expect(400)
    expect(subirVersion).not.toHaveBeenCalled()
  })

  it('400 si la versión de la descarga no es un número', async () => {
    await request(app.getHttpServer())
      .get(ruta(SECCION, '/uno/descarga'))
      .set('Authorization', sesion('PROFESOR'))
      .expect(400)
  })

  // Sin permiso CASL sobre MaterialVersion.
  it.each<Rol>(['AYUDANTE', 'ALUMNO', 'DIRECTOR', 'ADMINISTRATIVO'])(
    '%s no sube, no lee el historial ni descarga versiones: 403',
    async (rol) => {
      await request(app.getHttpServer())
        .post(ruta())
        .set('Authorization', sesion(rol))
        .send({ archivoId: ARCHIVO })
        .expect(403)
      for (const url of [ruta(), ruta(SECCION, '/1/descarga')]) {
        await request(app.getHttpServer())
          .get(url)
          .set('Authorization', sesion(rol))
          .expect(403)
      }
    },
  )

  it('una cuenta de profesor que es ayudante en la sección: 403', async () => {
    subirVersion.mockClear()
    await request(app.getHttpServer())
      .post(ruta(COMO_AYUDANTE))
      .set('Authorization', sesion('PROFESOR'))
      .send({ archivoId: ARCHIVO })
      .expect(403)
    await request(app.getHttpServer())
      .get(ruta(COMO_AYUDANTE))
      .set('Authorization', sesion('PROFESOR'))
      .expect(403)
    expect(subirVersion).not.toHaveBeenCalled()
  })

  it('409 si el archivo ya es otro material o versión', async () => {
    await request(app.getHttpServer())
      .post(ruta())
      .set('Authorization', sesion('PROFESOR'))
      .send({ archivoId: USADO })
      .expect(409)
  })
})
