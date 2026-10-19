import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { DataSource } from 'typeorm'
import { AppModule } from '../../src/app.module.js'
import { claveIntentos } from '../../src/auth/limite-login.service.js'
import { configurarApp } from '../../src/config/configurar-app.js'
import { opcionesDataSource } from '../../src/database/data-source.js'
import { ejecutarSeed } from '../../src/database/seed.js'

const BD_TEST = `${process.env.POSTGRES_TEST_DB ?? 'cursus_test'}_limite_login`
const BD_ORIGINAL = process.env.POSTGRES_DB
const PASSWORD = 'password-de-prueba'
const CORREO = 'profesor@norte.cursus.test'
const SECRETO = 'origen-solo-para-tests'
let admin: DataSource
let bd: DataSource
let app: INestApplication<App>

async function crearApp() {
  const modulo = await Test.createTestingModule({
    imports: [AppModule],
  }).compile()
  const nueva = modulo.createNestApplication<INestApplication<App>>({
    logger: false,
  })
  configurarApp(nueva, { secretoOrigen: SECRETO })
  // Un único listener para la ráfaga concurrente: Supertest no necesita
  // abrir/cerrar el mismo servidor por cada una de las 24 peticiones.
  await nueva.listen(0, '127.0.0.1')
  return nueva
}

const login = (correo = CORREO, ip = '192.0.2.1', password = 'incorrecta') =>
  request(app.getHttpServer())
    .post('/api/auth/login')
    .set('x-origin-secret', SECRETO)
    .set('x-vercel-forwarded-for', ip)
    .send({ correo, password })

beforeAll(async () => {
  admin = await new DataSource(opcionesDataSource()).initialize()
  await admin.query(`DROP DATABASE IF EXISTS "${BD_TEST}" WITH (FORCE)`)
  await admin.query(`CREATE DATABASE "${BD_TEST}"`)
  bd = await new DataSource(opcionesDataSource(BD_TEST)).initialize()
  await bd.runMigrations()
  await ejecutarSeed(bd, PASSWORD)
  process.env.POSTGRES_DB = BD_TEST
  app = await crearApp()
})

beforeEach(async () => {
  await bd.query('TRUNCATE limite_login')
})

afterAll(async () => {
  await app?.close()
  process.env.POSTGRES_DB = BD_ORIGINAL
  await bd?.destroy()
  if (admin?.isInitialized) {
    await admin.query(`DROP DATABASE IF EXISTS "${BD_TEST}" WITH (FORCE)`)
    await admin.destroy()
  }
})

describe('AUTH-07: límite de login compartido en PostgreSQL', () => {
  it('el quinto fallo responde 429 con Retry-After y no emite cookies', async () => {
    for (let i = 0; i < 4; i++) await login().expect(401)
    const quinta = await login().expect(429)
    expect(Number(quinta.headers['retry-after'])).toBeGreaterThan(0)
    expect(Number(quinta.headers['retry-after'])).toBeLessThanOrEqual(900)
    expect(quinta.body).toMatchObject({
      statusCode: 429,
      retryAfter: expect.any(Number) as unknown,
    })
    expect(quinta.get('Set-Cookie')).toBeUndefined()
    await login(CORREO, '192.0.2.1', PASSWORD).expect(429)
  })

  it('limita la cuenta aunque cambie la IP y normaliza el correo', async () => {
    for (let i = 1; i <= 4; i++) await login(CORREO, `192.0.2.${i}`).expect(401)
    await login(`  ${CORREO.toUpperCase()}  `, '192.0.2.5').expect(429)
    await login(CORREO, '192.0.2.6', PASSWORD).expect(429)
    await login('alumno@norte.cursus.test', '192.0.2.6', PASSWORD).expect(200)
  })

  it('limita una IP aunque cambie la cuenta, sin afectar otras IP', async () => {
    for (let i = 0; i < 19; i++)
      await login(`no-existe-${i}@norte.cursus.test`).expect(401)
    await login().expect(429)
    await login('alumno@norte.cursus.test', '192.0.2.1', PASSWORD).expect(429)
    await login('alumno@norte.cursus.test', '192.0.2.2', PASSWORD).expect(200)
  })

  it('un login exitoso reinicia los contadores de la cuenta y de la IP', async () => {
    await login(CORREO, '192.0.2.2').expect(401)
    await login('no-existe@norte.cursus.test').expect(401)
    await login(CORREO, '192.0.2.1', PASSWORD).expect(200)
    const filas = await bd.query<{ fallos: Date[] }[]>(
      'SELECT fallos FROM limite_login WHERE clave = ANY($1)',
      [[claveIntentos('cuenta', CORREO), claveIntentos('ip', '192.0.2.1')]],
    )
    expect(filas).toEqual([{ fallos: [] }, { fallos: [] }])
    for (let i = 0; i < 4; i++) await login().expect(401)
    await login().expect(429)
  })

  it('el bloqueo expira sin dormir 15 minutos ni extenderse al reintentar', async () => {
    for (let i = 0; i < 5; i++) await login()
    const anteriores = await bd.query<{ clave: string; fallos: Date[] }[]>(
      'SELECT clave, fallos FROM limite_login ORDER BY clave',
    )
    await login().expect(429)
    expect(
      await bd.query('SELECT clave, fallos FROM limite_login ORDER BY clave'),
    ).toEqual(anteriores)
    await bd.query(
      `UPDATE limite_login SET fallos = ARRAY(SELECT f - interval '15 minutes' FROM unnest(fallos) AS f)`,
    )
    await login(CORREO, '192.0.2.1', PASSWORD).expect(200)
  })

  it('conserva los fallos recientes al salir uno antiguo de la ventana móvil', async () => {
    for (let i = 0; i < 4; i++) await login().expect(401)
    await bd.query(
      `UPDATE limite_login SET fallos[1] = clock_timestamp() - interval '16 minutes'`,
    )
    await login().expect(401)
    await login().expect(429)
  })

  it('peticiones simultáneas no pasan por encima del umbral', async () => {
    const respuestas = await Promise.all(
      Array.from({ length: 8 }, () => login()),
    )
    expect(respuestas.filter((r) => r.status === 401)).toHaveLength(4)
    expect(respuestas.filter((r) => r.status === 429)).toHaveLength(4)
  })

  it('un nuevo proceso de API conserva el bloqueo', async () => {
    for (let i = 0; i < 5; i++) await login()
    await app.close()
    app = await crearApp()
    await login().expect(429)
  })

  it('rechaza cabeceras de IP inválidas y no acepta un secreto de origen falso', async () => {
    await login(CORREO, '192.0.2.1, 192.0.2.2').expect(400)
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('x-origin-secret', 'falso')
      .set('x-vercel-forwarded-for', '192.0.2.1')
      .send({ correo: CORREO, password: PASSWORD })
      .expect(403)
    expect(await bd.query('SELECT * FROM limite_login')).toEqual([])
  })

  it('cambiar X-Forwarded-For no altera la IP que garantiza Vercel', async () => {
    for (let i = 0; i < 20; i++) {
      await login(`nadie-${i}@norte.cursus.test`)
        .set('X-Forwarded-For', `198.51.100.${i}`)
        .expect(i < 19 ? 401 : 429)
    }
  })

  it.each(['/api/auth/login/', '/API/AUTH/LOGIN'])(
    'no evade la IP confiable usando %s',
    async (ruta) => {
      for (let i = 0; i < 20; i++) {
        await request(app.getHttpServer())
          .post(ruta)
          .set('x-origin-secret', SECRETO)
          .set('x-vercel-forwarded-for', '192.0.2.1')
          .send({
            correo: `nadie-${i}@norte.cursus.test`,
            password: 'incorrecta',
          })
          .expect(i < 19 ? 401 : 429)
      }
      await login(CORREO, '192.0.2.2', PASSWORD).expect(200)
    },
  )

  it('normaliza representaciones equivalentes de IPv6', async () => {
    for (let i = 0; i < 19; i++)
      await login(
        `nadie-${i}@norte.cursus.test`,
        '2001:0db8:0:0:0:0:0:1',
      ).expect(401)
    await login(CORREO, '2001:db8::1').expect(429)
  })

  it('sin cabecera confiable mantiene login y límite por cuenta sin un contador IP ficticio', async () => {
    const sinIp = (correo: string, password: string) =>
      request(app.getHttpServer())
        .post('/api/auth/login')
        .set('x-origin-secret', SECRETO)
        .set('X-Forwarded-For', '198.51.100.10')
        .send({ correo, password })
    await sinIp(CORREO, PASSWORD).expect(200)
    for (let i = 0; i < 4; i++) await sinIp(CORREO, 'incorrecta').expect(401)
    await sinIp(CORREO, 'incorrecta').expect(429)
    await sinIp('alumno@norte.cursus.test', PASSWORD).expect(200)
    const filas = await bd.query<{ clave: string }[]>(
      'SELECT clave FROM limite_login ORDER BY clave',
    )
    expect(filas.map((fila) => fila.clave)).toEqual(
      [
        claveIntentos('cuenta', CORREO),
        claveIntentos('cuenta', 'alumno@norte.cursus.test'),
      ].sort(),
    )
  })

  it('un éxito reinicia también una IP con 19 fallos acumulados', async () => {
    for (let i = 0; i < 19; i++)
      await login(`nadie-${i}@norte.cursus.test`).expect(401)
    await login(CORREO, '192.0.2.1', PASSWORD).expect(200)
    for (let i = 0; i < 19; i++)
      await login(`nadie-${i}@norte.cursus.test`).expect(401)
    await login('otra@norte.cursus.test').expect(429)
  }, 15000)

  it('el límite IP de 20 se mantiene con peticiones simultáneas de cuentas diferentes', async () => {
    const respuestas = await Promise.all(
      Array.from({ length: 24 }, (_, i) =>
        login(`nadie-${i}@norte.cursus.test`),
      ),
    )
    expect(respuestas.filter((r) => r.status === 401)).toHaveLength(19)
    expect(respuestas.filter((r) => r.status === 429)).toHaveLength(5)
  }, 15000)

  it('LoginDto rechaza propiedades extra y tipos incorrectos antes de registrar intentos; conserva helmet', async () => {
    for (const body of [
      { correo: CORREO, password: 123 },
      { correo: CORREO, password: PASSWORD, extra: true },
    ]) {
      const respuesta = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('x-origin-secret', SECRETO)
        .set('x-vercel-forwarded-for', '192.0.2.1')
        .send(body)
        .expect(400)
      expect(respuesta.headers['x-content-type-options']).toBe('nosniff')
      expect(respuesta.headers['content-security-policy']).toContain(
        "default-src 'none'",
      )
    }
    expect(await bd.query('SELECT * FROM limite_login')).toEqual([])
  })
})
