import type { DescargaArchivo, Rol, SeccionEspacio } from '@cursus/shared'
import { type INestApplication, NotFoundException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { vi } from 'vitest'
import { AppModule } from '../../src/app.module.js'
import { AlmacenamientoService } from '../../src/archivos/almacenamiento.service.js'
import { AuthService } from '../../src/auth/auth.service.js'
import { configurarApp } from '../../src/config/configurar-app.js'
import { BaseDeDatos } from '../../src/database/base-de-datos.service.js'
import { AccesoSeccionService } from '../../src/espacio/acceso-seccion.service.js'

// MAT-10 sin PostgreSQL: sesión, CASL, rol en la sección, ids y respuestas.
// La sección OTRA no es del usuario; la consulta simula la RLS: solo existen
// ACTIVIDAD y ENTREGA.
const jwt = new JwtService({ secret: process.env.JWT_SECRET })
const sesion = (rol: Rol) =>
  `Bearer ${jwt.sign({
    sub: '00000000-0000-4000-8000-000000000001',
    sid: '00000000-0000-4000-8000-000000000003',
    universidad_id: '00000000-0000-4000-8000-000000000002',
    rol,
  })}`
const SECCION = '00000000-0000-4000-8000-000000000010'
const OTRA = '00000000-0000-4000-8000-000000000011'
const ACTIVIDAD = '00000000-0000-4000-8000-000000000020'
const ENTREGA = '00000000-0000-4000-8000-000000000030'
const NO_EXISTE = '00000000-0000-4000-8000-000000000099'
const ruta = (seccion = SECCION, actividad = ACTIVIDAD) =>
  `/api/espacio/secciones/${seccion}/actividades/${actividad}/entregas`

const firmarDescarga = vi.fn(() =>
  Promise.resolve({ url: 'https://s3.test/x', expiraEn: new Date() }),
)
const query = (sql: string, params: string[] = []) => {
  if (sql.includes('FROM actividad a'))
    return Promise.resolve(params[2] === ACTIVIDAD ? [{ id: ACTIVIDAD }] : [])
  if (sql.includes('FROM entrega e'))
    return Promise.resolve(
      params[2] === ENTREGA
        ? [{ clave: 'u/s/f', nombre: 'Informe.pdf', version: 'v1' }]
        : [],
    )
  if (sql.includes('FROM inscripcion i'))
    return Promise.resolve([
      { alumno: { id: 'a', nombre: 'Ana', correo: 'a@x' }, entrega: null },
    ])
  return Promise.resolve([])
}

let app: INestApplication<App>
beforeAll(async () => {
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(AuthService)
    .useValue({ sesionActiva: () => Promise.resolve(true) })
    .overrideProvider(AccesoSeccionService)
    .useValue({
      verificar: (contexto: { rol: Rol }, _: string, id: string) => {
        if (id === OTRA) throw new NotFoundException('La sección no existe')
        return Promise.resolve({ id, rol: contexto.rol } as SeccionEspacio)
      },
    })
    .overrideProvider(BaseDeDatos)
    .useValue({
      enTransaccionEnUniversidad: (
        _: unknown,
        fn: (bd: { query: typeof query }) => unknown,
      ) => fn({ query }),
    })
    .overrideProvider(AlmacenamientoService)
    .useValue({ firmarDescarga })
    .compile()
  app = modulo.createNestApplication<INestApplication<App>>({ logger: false })
  configurarApp(app, { secretoOrigen: '' })
  await app.init()
})
afterAll(async () => {
  await app?.close()
})

describe('entregas de una actividad para el equipo docente (MAT-10)', () => {
  it.each<Rol>(['PROFESOR', 'AYUDANTE'])(
    '%s lista y descarga: 200',
    async (rol) => {
      const lista = await request(app.getHttpServer())
        .get(ruta())
        .set('Authorization', sesion(rol))
        .expect(200)
      expect(lista.body).toEqual([
        { alumno: { id: 'a', nombre: 'Ana', correo: 'a@x' }, entrega: null },
      ])
      firmarDescarga.mockClear()
      const descarga = await request(app.getHttpServer())
        .get(`${ruta()}/${ENTREGA}/descarga`)
        .set('Authorization', sesion(rol))
        .expect(200)
      expect((descarga.body as DescargaArchivo).url).toBe('https://s3.test/x')
      expect(firmarDescarga).toHaveBeenCalledWith('u/s/f', 'Informe.pdf', 'v1')
    },
  )

  it('sin sesión responde 401', async () => {
    await request(app.getHttpServer()).get(ruta()).expect(401)
    await request(app.getHttpServer())
      .get(`${ruta()}/${ENTREGA}/descarga`)
      .expect(401)
  })

  it.each<Rol>(['ALUMNO', 'ADMINISTRATIVO', 'DIRECTOR'])(
    '%s no lista ni descarga: 403',
    async (rol) => {
      await request(app.getHttpServer())
        .get(ruta())
        .set('Authorization', sesion(rol))
        .expect(403)
      await request(app.getHttpServer())
        .get(`${ruta()}/${ENTREGA}/descarga`)
        .set('Authorization', sesion(rol))
        .expect(403)
    },
  )

  it('otra sección, otra actividad o una entrega inexistente: 404', async () => {
    for (const url of [
      ruta(OTRA),
      ruta(SECCION, NO_EXISTE),
      `${ruta(OTRA)}/${ENTREGA}/descarga`,
      `${ruta(SECCION, NO_EXISTE)}/${ENTREGA}/descarga`,
      `${ruta()}/${NO_EXISTE}/descarga`,
    ]) {
      await request(app.getHttpServer())
        .get(url)
        .set('Authorization', sesion('PROFESOR'))
        .expect(404)
    }
  })

  it('ids que no son UUID: 400', async () => {
    await request(app.getHttpServer())
      .get(ruta(SECCION, 'no-es-uuid'))
      .set('Authorization', sesion('PROFESOR'))
      .expect(400)
    await request(app.getHttpServer())
      .get(`${ruta()}/no-es-uuid/descarga`)
      .set('Authorization', sesion('PROFESOR'))
      .expect(400)
  })
})
