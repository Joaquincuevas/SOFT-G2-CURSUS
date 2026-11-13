import {
  CODIGO_MFA_CODIGO_INVALIDO,
  CODIGO_MFA_DESAFIO_INVALIDO,
  type LoginMfaRequerido,
} from '@cursus/shared'
import type { INestApplication } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import { hash } from 'argon2'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { DataSource } from 'typeorm'
import { AppModule } from '../../src/app.module.js'
import type { RespuestaLogin } from '../../src/auth/auth.controller.js'
import { firmarDesafioMfa } from '../../src/auth/desafio-mfa.js'
import { MAX_FALLOS_CUENTA } from '../../src/auth/limite-login.service.js'
import { configurarApp } from '../../src/config/configurar-app.js'
import { opcionesDataSource } from '../../src/database/data-source.js'
import { ejecutarSeed } from '../../src/database/seed.js'
import { cifrarSecretoTotp, llaveMfa } from '../../src/seguridad/cifrado-mfa.js'
import {
  codigoTotp,
  generarSecretoTotp,
  pasoDe,
  SEGUNDOS_POR_PASO,
} from '../../src/seguridad/totp.js'

// SEG-02: el login pide el código TOTP cuando la cuenta tiene MFA activo. Cada
// test usa su propio usuario: un código solo sirve una vez (su paso queda
// registrado) y el límite de intentos se reinicia en cada test.
const BD_TEST = `${process.env.POSTGRES_TEST_DB ?? 'cursus_test'}_login_mfa`
const PASSWORD = 'contraseña-de-prueba'
const MFA_SECRET = 'secreto-mfa-de-prueba-solo-para-tests'
const BD_ORIGINAL = process.env.POSTGRES_DB
const MFA_ORIGINAL = process.env.MFA_SECRET
const PASO_MS = SEGUNDOS_POR_PASO * 1000

let admin: DataSource
let bd: DataSource
let app: INestApplication<App>
let jwt: JwtService
let contador = 0

interface CuentaMfa {
  correo: string
  id: string
  secreto: string
}

// Un usuario de Norte; con MFA activo si conMfa, con el secreto cifrado como
// lo guarda SEG-01.
async function crearCuenta(
  conMfa = true,
  rol = 'PROFESOR',
): Promise<CuentaMfa> {
  const correo = `mfa${++contador}@norte.cursus.test`
  const [{ id }] = await bd.query<{ id: string }[]>(
    `INSERT INTO usuario (universidad_id, facultad_id, nombre, correo, password_hash, rol)
     SELECT u.universidad_id, u.facultad_id, $2, $1, $3, $4
       FROM usuario u WHERE u.correo = 'profesor@norte.cursus.test'
     RETURNING id`,
    [correo, `Usuario ${correo}`, await hash(PASSWORD), rol],
  )
  const secreto = generarSecretoTotp()
  if (conMfa) {
    await bd.query(
      `INSERT INTO mfa_usuario (usuario_id, secreto_cifrado, activado_en)
       VALUES ($1, $2, now())`,
      [id, cifrarSecretoTotp(llaveMfa(MFA_SECRET), id, secreto)],
    )
  }
  return { correo, id, secreto }
}

const paso1 = (correo: string, password = PASSWORD) =>
  request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ correo, password })

async function desafioDe(cuenta: CuentaMfa): Promise<string> {
  const respuesta = await paso1(cuenta.correo).expect(200)
  return (respuesta.body as LoginMfaRequerido).desafio
}

const paso2 = (desafio: string, codigo: unknown) =>
  request(app.getHttpServer())
    .post('/api/auth/login/mfa')
    .send({ desafio, codigo })

// Código de la app en el paso actual + delta (±1 es la tolerancia).
const codigo = (cuenta: CuentaMfa, delta = 0) =>
  codigoTotp(cuenta.secreto, Date.now() + delta * PASO_MS)

const ultimoPaso = async (cuenta: CuentaMfa) =>
  (
    await bd.query<{ ultimo_paso: number | null }[]>(
      'SELECT ultimo_paso FROM mfa_usuario WHERE usuario_id = $1',
      [cuenta.id],
    )
  )[0]?.ultimo_paso

async function sesionesDe(cuenta: CuentaMfa) {
  const [{ n }] = await bd.query<{ n: string }[]>(
    `SELECT (SELECT count(*) FROM sesion_auth WHERE usuario_id = $1)
          + (SELECT count(*) FROM refresh_token WHERE usuario_id = $1) AS n`,
    [cuenta.id],
  )
  return Number(n)
}

const eventosDe = (cuenta: CuentaMfa) =>
  bd.query<
    {
      resultado: string
      detalle: Record<string, unknown>
      tipo: string
      ip: string | null
    }[]
  >(
    `SELECT tipo, resultado, detalle, host(ip) AS ip FROM evento_auditoria
      WHERE usuario_id = $1 ORDER BY fecha, id`,
    [cuenta.id],
  )

beforeAll(async () => {
  admin = await new DataSource(opcionesDataSource()).initialize()
  await admin.query(`DROP DATABASE IF EXISTS "${BD_TEST}" WITH (FORCE)`)
  await admin.query(`CREATE DATABASE "${BD_TEST}"`)
  bd = await new DataSource(opcionesDataSource(BD_TEST)).initialize()
  await bd.runMigrations()
  await ejecutarSeed(bd, PASSWORD)
  process.env.POSTGRES_DB = BD_TEST
  process.env.MFA_SECRET = MFA_SECRET
  const modulo = await Test.createTestingModule({
    imports: [AppModule],
  }).compile()
  app = modulo.createNestApplication<INestApplication<App>>({ logger: false })
  configurarApp(app, { secretoOrigen: '' })
  await app.init()
  jwt = app.get(JwtService, { strict: false })
})

beforeEach(async () => {
  await bd.query('TRUNCATE limite_login')
})

afterAll(async () => {
  await app?.close()
  process.env.POSTGRES_DB = BD_ORIGINAL
  process.env.MFA_SECRET = MFA_ORIGINAL
  await bd?.destroy()
  if (admin?.isInitialized) {
    await admin.query(`DROP DATABASE IF EXISTS "${BD_TEST}" WITH (FORCE)`)
    await admin.destroy()
  }
})

describe('paso 1: correo y contraseña', () => {
  it('con MFA activo no emite sesión: entrega un desafío', async () => {
    const cuenta = await crearCuenta()
    const respuesta = await paso1(cuenta.correo).expect(200)
    expect(respuesta.body).toEqual({
      mfaRequerido: true,
      desafio: expect.any(String) as string,
    })
    expect(JSON.stringify(respuesta.body)).not.toContain('accessToken')
    expect(respuesta.get('Set-Cookie')).toBeUndefined()
    // Ni sesión ni refresh token en la base: nada que reclamar sin el código.
    expect(await sesionesDe(cuenta)).toBe(0)
  })

  it('un usuario sin MFA inicia sesión como siempre', async () => {
    const cuenta = await crearCuenta(false)
    const respuesta = await paso1(cuenta.correo).expect(200)
    expect(respuesta.body).toEqual({
      accessToken: expect.any(String) as string,
    })
    expect(respuesta.get('Set-Cookie')?.[0]).toContain('refresh=')
    expect(await sesionesDe(cuenta)).toBe(2)
  })

  it('un MFA pendiente (sin confirmar) no pide código', async () => {
    const cuenta = await crearCuenta(false)
    await bd.query(
      `INSERT INTO mfa_usuario (usuario_id, secreto_cifrado) VALUES ($1, $2)`,
      [
        cuenta.id,
        cifrarSecretoTotp(llaveMfa(MFA_SECRET), cuenta.id, cuenta.secreto),
      ],
    )
    const respuesta = await paso1(cuenta.correo).expect(200)
    expect(respuesta.body).toHaveProperty('accessToken')
  })

  it('no revela si la cuenta tiene MFA antes de validar la contraseña', async () => {
    const conMfa = await crearCuenta(true)
    const sinMfa = await crearCuenta(false)
    const a = await paso1(conMfa.correo, 'incorrecta')
    const b = await paso1(sinMfa.correo, 'incorrecta')
    const c = await paso1('no-existe@norte.cursus.test', 'incorrecta')
    expect([a.status, b.status, c.status]).toEqual([401, 401, 401])
    expect(a.body).toEqual(b.body)
    expect(a.body).toEqual(c.body)
  })

  it('la contraseña correcta que espera el código no reinicia el límite de la IP', async () => {
    // 19 códigos fallidos desde la IP, repartidos entre cinco usuarios.
    const cuentas = await Promise.all(
      Array.from({ length: 5 }, () => crearCuenta()),
    )
    const desafios = await Promise.all(cuentas.map(desafioDe))
    for (const [i, desafio] of desafios.entries()) {
      for (let n = 0; n < (i === 4 ? 3 : 4); n++) {
        await paso2(desafio, '000001').expect(401)
      }
    }
    // Otro usuario entra con su contraseña correcta: si eso reiniciara el
    // contador, se podrían adivinar códigos sin tope reiniciándolo.
    const otra = await crearCuenta()
    const desafioOtra = await desafioDe(otra)
    const siguiente = await paso2(desafioOtra, '000001')
    expect(siguiente.status).toBe(429)
  })

  it('el límite por usuario sigue en pie tras un nuevo paso 1', async () => {
    const cuenta = await crearCuenta()
    const desafio = await desafioDe(cuenta)
    for (let i = 0; i < MAX_FALLOS_CUENTA - 1; i++) {
      await paso2(desafio, '000000').expect(401)
    }
    await paso1(cuenta.correo).expect(200)
    expect((await paso2(desafio, '000000')).status).toBe(429)
  })
})

describe('paso 2: el código de la app', () => {
  it('con un código válido emite la sesión', async () => {
    const cuenta = await crearCuenta()
    const respuesta = await paso2(
      await desafioDe(cuenta),
      codigo(cuenta),
    ).expect(200)
    expect(respuesta.body).toEqual({
      accessToken: expect.any(String) as string,
    })
    expect(respuesta.get('Set-Cookie')?.[0]).toContain('refresh=')
    const { accessToken } = respuesta.body as RespuestaLogin
    const yo = await request(app.getHttpServer())
      .get('/api/auth/yo')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
    expect(yo.body).toMatchObject({ correo: cuenta.correo })
    expect(await ultimoPaso(cuenta)).toBe(pasoDe(Date.now()))
  })

  it('acepta el código con espacios, como lo muestra la app', async () => {
    const cuenta = await crearCuenta()
    const c = codigo(cuenta)
    await paso2(
      await desafioDe(cuenta),
      `${c.slice(0, 3)} ${c.slice(3)}`,
    ).expect(200)
  })

  it.each([-1, 1])(
    'acepta el paso vecino (%i): el reloj del teléfono puede estar corrido',
    async (delta) => {
      const cuenta = await crearCuenta()
      await paso2(await desafioDe(cuenta), codigo(cuenta, delta)).expect(200)
    },
  )

  it.each([-2, 2])(
    'rechaza un código dos pasos fuera de la ventana (%i)',
    async (delta) => {
      const cuenta = await crearCuenta()
      const respuesta = await paso2(
        await desafioDe(cuenta),
        codigo(cuenta, delta),
      )
      expect(respuesta.status).toBe(401)
      expect(respuesta.body).toMatchObject({
        message: 'Código inválido o expirado',
        code: CODIGO_MFA_CODIGO_INVALIDO,
      })
      expect(respuesta.get('Set-Cookie')).toBeUndefined()
      expect(await sesionesDe(cuenta)).toBe(0)
    },
  )

  it('rechaza un código inválido sin emitir sesión', async () => {
    const cuenta = await crearCuenta()
    const valido = codigo(cuenta)
    const malo = valido === '000000' ? '111111' : '000000'
    const respuesta = await paso2(await desafioDe(cuenta), malo)
    expect(respuesta.status).toBe(401)
    expect(respuesta.body).not.toHaveProperty('accessToken')
    expect(respuesta.get('Set-Cookie')).toBeUndefined()
    expect(await sesionesDe(cuenta)).toBe(0)
  })

  it.each(['12345', '1234567', 'abcdef', '12 34', ''])(
    'un formato inválido (%j) responde 400',
    async (formato) => {
      const cuenta = await crearCuenta()
      await paso2(await desafioDe(cuenta), formato).expect(400)
    },
  )

  it('rechaza el reuso del mismo código dentro de su ventana', async () => {
    const cuenta = await crearCuenta()
    const c = codigo(cuenta)
    await paso2(await desafioDe(cuenta), c).expect(200)
    // Otra contraseña correcta, otro desafío, el mismo código.
    const reuso = await paso2(await desafioDe(cuenta), c)
    expect(reuso.status).toBe(401)
    expect(reuso.body).toMatchObject({ code: CODIGO_MFA_CODIGO_INVALIDO })
    // Y tampoco uno de un paso anterior al ya usado.
    await paso2(await desafioDe(cuenta), codigo(cuenta, -1)).expect(401)
  })

  it('el código que confirmó el MFA tampoco sirve para iniciar sesión', async () => {
    const cuenta = await crearCuenta(false)
    const sesion = await paso1(cuenta.correo).expect(200)
    const token = (sesion.body as RespuestaLogin).accessToken
    const auth = { Authorization: `Bearer ${token}` }
    const inicio = await request(app.getHttpServer())
      .post('/api/perfil/mfa/inicio')
      .set(auth)
      .expect(200)
    const secreto = (inicio.body as { secreto: string }).secreto
    await request(app.getHttpServer())
      .post('/api/perfil/mfa/confirmacion')
      .set(auth)
      .send({ codigo: codigoTotp(secreto) })
      .expect(204)
    const siguiente = await paso1(cuenta.correo).expect(200)
    const desafio = (siguiente.body as LoginMfaRequerido).desafio
    await paso2(desafio, codigoTotp(secreto)).expect(401)
    await paso2(desafio, codigoTotp(secreto, Date.now() + PASO_MS)).expect(200)
  })

  it('un desafío sirve para un solo inicio de sesión', async () => {
    const cuenta = await crearCuenta()
    const desafio = await desafioDe(cuenta)
    await paso2(desafio, codigo(cuenta)).expect(200)
    // Con un código nuevo (otro paso), el mismo desafío ya no vale.
    const repetido = await paso2(desafio, codigo(cuenta, 1))
    expect(repetido.status).toBe(401)
    expect(repetido.body).toMatchObject({ code: CODIGO_MFA_CODIGO_INVALIDO })
  })

  it('una cuenta archivada entre los dos pasos no inicia sesión', async () => {
    const cuenta = await crearCuenta()
    const desafio = await desafioDe(cuenta)
    await bd.query('UPDATE usuario SET archived_at = now() WHERE id = $1', [
      cuenta.id,
    ])
    await paso2(desafio, codigo(cuenta)).expect(401)
    expect(await sesionesDe(cuenta)).toBe(0)
  })
})

describe('el desafío', () => {
  const firmado = (cuenta: CuentaMfa, expiresIn?: string) =>
    firmarDesafioMfa(jwt, { usuarioId: cuenta.id, ultimoPaso: null }, expiresIn)

  it('expirado se rechaza y pide volver al paso 1', async () => {
    const cuenta = await crearCuenta()
    const respuesta = await paso2(await firmado(cuenta, '-1s'), codigo(cuenta))
    expect(respuesta.status).toBe(401)
    expect(respuesta.body).toMatchObject({
      message: 'La verificación expiró. Inicia sesión de nuevo.',
      code: CODIGO_MFA_DESAFIO_INVALIDO,
    })
    expect(await sesionesDe(cuenta)).toBe(0)
  })

  it('manipulado se rechaza', async () => {
    const cuenta = await crearCuenta()
    const desafio = await desafioDe(cuenta)
    const [cabecera, cuerpo, firma] = desafio.split('.')
    const otroUsuario = Buffer.from(
      JSON.stringify({
        ...JSON.parse(Buffer.from(cuerpo, 'base64url').toString()),
        sub: (await crearCuenta()).id,
      }),
    ).toString('base64url')
    for (const falso of [
      `${cabecera}.${otroUsuario}.${firma}`,
      `${cabecera}.${cuerpo}.${firma.slice(0, -2)}xx`,
      desafio.slice(0, -1) + (desafio.endsWith('A') ? 'B' : 'A'),
      'no.es.un-jwt',
      'x',
    ]) {
      const respuesta = await paso2(falso, codigo(cuenta))
      expect(respuesta.status).toBe(401)
      expect(respuesta.body).toMatchObject({
        code: CODIGO_MFA_DESAFIO_INVALIDO,
      })
    }
    expect(await sesionesDe(cuenta)).toBe(0)
  })

  it('un JWT de sesión no sirve como desafío', async () => {
    const cuenta = await crearCuenta(false)
    const inicio = await paso1(cuenta.correo).expect(200)
    const respuesta = await paso2(
      (inicio.body as RespuestaLogin).accessToken,
      '123456',
    )
    expect(respuesta.status).toBe(401)
    expect(respuesta.body).toMatchObject({ code: CODIGO_MFA_DESAFIO_INVALIDO })
  })

  it('un desafío con otro propósito, firmado con la llave de sesión, no sirve', async () => {
    const cuenta = await crearCuenta()
    const conLlaveDeSesion = await jwt.signAsync({
      sub: cuenta.id,
      prop: 'mfa',
      up: null,
    })
    const respuesta = await paso2(conLlaveDeSesion, codigo(cuenta))
    expect(respuesta.status).toBe(401)
    expect(respuesta.body).toMatchObject({ code: CODIGO_MFA_DESAFIO_INVALIDO })
  })

  it('no sirve como token de sesión en ninguna ruta protegida', async () => {
    const cuenta = await crearCuenta()
    const desafio = await desafioDe(cuenta)
    for (const ruta of [
      '/api/auth/yo',
      '/api/perfil/mfa',
      '/api/dashboard/mis-secciones',
    ]) {
      await request(app.getHttpServer())
        .get(ruta)
        .set('Authorization', `Bearer ${desafio}`)
        .expect(401)
    }
  })
})

describe('límite de intentos', () => {
  it('tras cinco códigos fallidos responde 429, aunque el siguiente sea correcto', async () => {
    const cuenta = await crearCuenta()
    const desafio = await desafioDe(cuenta)
    const malo = codigo(cuenta) === '000000' ? '111111' : '000000'
    for (let i = 0; i < MAX_FALLOS_CUENTA - 1; i++) {
      await paso2(desafio, malo).expect(401)
    }
    const quinto = await paso2(desafio, malo)
    expect(quinto.status).toBe(429)
    expect(Number(quinto.headers['retry-after'])).toBeGreaterThan(0)
    expect(quinto.body).toMatchObject({ statusCode: 429 })
    // Bloqueado: ni siquiera se evalúa el código, y no dice si era correcto.
    const bloqueado = await paso2(desafio, codigo(cuenta))
    expect(bloqueado.status).toBe(429)
    expect(bloqueado.body).toEqual(quinto.body)
    expect(bloqueado.get('Set-Cookie')).toBeUndefined()
    expect(await sesionesDe(cuenta)).toBe(0)
    expect(await ultimoPaso(cuenta)).toBeNull()
  })

  it('cuenta por usuario: otro usuario sigue pudiendo iniciar sesión', async () => {
    const a = await crearCuenta()
    const b = await crearCuenta()
    const desafioA = await desafioDe(a)
    for (let i = 0; i < MAX_FALLOS_CUENTA; i++) await paso2(desafioA, '000001')
    await paso2(await desafioDe(b), codigo(b)).expect(200)
  })

  it('cuenta también por IP: varios usuarios desde la misma IP', async () => {
    // 20 fallos de IP repartidos en cuatro usuarios (cinco cada uno no, para
    // no bloquear a ninguno por cuenta): 4 por usuario en cinco usuarios.
    const cuentas = await Promise.all(
      Array.from({ length: 6 }, () => crearCuenta()),
    )
    const desafios = await Promise.all(cuentas.map(desafioDe))
    for (const desafio of desafios.slice(0, 5)) {
      for (let i = 0; i < 4; i++) await paso2(desafio, '000001')
    }
    // La IP acumula 20 fallos: el sexto usuario, con su código correcto, 429.
    const bloqueado = await paso2(desafios[5], codigo(cuentas[5]))
    expect(bloqueado.status).toBe(429)
  })
})

describe('registro de accesos (SEG-04)', () => {
  it('el paso 1 pendiente no registra nada; el éxito registra un INICIO_SESION con subtipo MFA', async () => {
    const cuenta = await crearCuenta()
    const desafio = await desafioDe(cuenta)
    expect(await eventosDe(cuenta)).toEqual([])
    await paso2(desafio, codigo(cuenta)).expect(200)
    expect(await eventosDe(cuenta)).toEqual([
      {
        tipo: 'INICIO_SESION',
        resultado: 'EXITOSO',
        detalle: { subtipo: 'MFA' },
        ip: '127.0.0.1',
      },
    ])
  })

  it('un código inválido registra FALLIDO y el bloqueo BLOQUEADO, con el usuario', async () => {
    const cuenta = await crearCuenta()
    const desafio = await desafioDe(cuenta)
    for (let i = 0; i < MAX_FALLOS_CUENTA; i++) await paso2(desafio, '000001')
    await paso2(desafio, codigo(cuenta))
    const resultados = (await eventosDe(cuenta)).map((e) => e.resultado)
    expect(resultados).toEqual([
      'FALLIDO',
      'FALLIDO',
      'FALLIDO',
      'FALLIDO',
      'BLOQUEADO',
      'BLOQUEADO',
    ])
    expect(
      (await eventosDe(cuenta)).every((e) => e.detalle.subtipo === 'MFA'),
    ).toBe(true)
  })

  it('no guarda el código, el secreto ni el desafío', async () => {
    const cuenta = await crearCuenta()
    const desafio = await desafioDe(cuenta)
    const valido = codigo(cuenta)
    const malo = valido === '987654' ? '987653' : '987654'
    await paso2(desafio, malo).expect(401)
    await paso2(desafio, valido).expect(200)
    const [{ tabla }] = await bd.query<{ tabla: string }[]>(
      `SELECT coalesce(string_agg(row_to_json(e)::text, ' '), '') AS tabla
         FROM evento_auditoria e`,
    )
    for (const secreto of [valido, malo, cuenta.secreto, desafio, PASSWORD]) {
      expect(tabla).not.toContain(secreto)
    }
    const [{ columnas }] = await bd.query<{ columnas: string }[]>(
      `SELECT string_agg(column_name, ',' ORDER BY ordinal_position) AS columnas
         FROM information_schema.columns WHERE table_name = 'evento_auditoria'`,
    )
    expect(columnas).toBe(
      'id,tipo,resultado,usuario_id,universidad_id,fecha,ip,detalle',
    )
  })
})
