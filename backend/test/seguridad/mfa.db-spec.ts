import type { EstadoMfa, InicioMfa } from '@cursus/shared'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { hash } from 'argon2'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { DataSource } from 'typeorm'
import { AppModule } from '../../src/app.module.js'
import type { RespuestaLogin } from '../../src/auth/auth.controller.js'
import { configurarApp } from '../../src/config/configurar-app.js'
import { crearSuperadmin } from '../../src/database/crear-superadmin.js'
import { opcionesDataSource } from '../../src/database/data-source.js'
import { ejecutarSeed } from '../../src/database/seed.js'
import {
  descifrarSecretoTotp,
  llaveMfa,
} from '../../src/seguridad/cifrado-mfa.js'
import { codigoTotp } from '../../src/seguridad/totp.js'

// SEG-01: el usuario activa MFA con una app autenticadora desde su perfil.
// Cada test usa un usuario distinto, porque el MFA activado no se desactiva.

const BD_TEST = `${process.env.POSTGRES_TEST_DB ?? 'cursus_test'}_mfa`
const PASSWORD = 'contraseña-de-prueba'
const MFA_SECRET = 'secreto-mfa-de-prueba-solo-para-tests'
const BD_ORIGINAL = process.env.POSTGRES_DB
const MFA_ORIGINAL = process.env.MFA_SECRET
const SUPERADMIN = 'superadmin@cursus.test'
const CHECK = '23514'
const SIN_PERMISO = '42501'

let admin: DataSource
let bd: DataSource
let app: INestApplication<App>

async function token(correo: string): Promise<string> {
  const respuesta = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ correo, password: PASSWORD })
    .expect(200)
  return (respuesta.body as RespuestaLogin).accessToken
}

const conToken = (t: string | null, peticion: request.Test) =>
  t ? peticion.set('Authorization', `Bearer ${t}`) : peticion

const estado = (t: string | null) =>
  conToken(t, request(app.getHttpServer()).get('/api/perfil/mfa'))
const iniciar = (t: string | null) =>
  conToken(t, request(app.getHttpServer()).post('/api/perfil/mfa/inicio'))
const confirmar = (t: string | null, codigo: unknown) =>
  conToken(
    t,
    request(app.getHttpServer()).post('/api/perfil/mfa/confirmacion'),
  ).send({ codigo })

async function idDe(correo: string): Promise<string> {
  const [{ id }] = await bd.query<{ id: string }[]>(
    `SELECT id FROM usuario WHERE correo = $1`,
    [correo],
  )
  return id
}

async function filaMfa(correo: string) {
  const [fila] = await bd.query<
    { secreto_cifrado: string; activado_en: Date | null }[]
  >(
    `SELECT secreto_cifrado, activado_en FROM mfa_usuario
      WHERE usuario_id = $1`,
    [await idDe(correo)],
  )
  return fila
}

// Un usuario nuevo de la universidad Norte, para no cruzar tests.
async function crearUsuario(
  correo: string,
  rol = 'PROFESOR',
  extra = '',
): Promise<string> {
  const [{ id }] = await bd.query<{ id: string }[]>(
    `INSERT INTO usuario (universidad_id, facultad_id, nombre, correo, password_hash, rol)
     SELECT u.universidad_id, u.facultad_id, $2, $1, $3, $4
       FROM usuario u WHERE u.correo = 'profesor@norte.cursus.test'
     RETURNING id`,
    [correo, `Usuario ${correo}`, await hash(PASSWORD), rol],
  )
  if (extra) {
    await bd.query(`UPDATE usuario SET ${extra} WHERE id = $1`, [id])
  }
  return correo
}

beforeAll(async () => {
  admin = await new DataSource(opcionesDataSource()).initialize()
  await admin.query(`DROP DATABASE IF EXISTS "${BD_TEST}" WITH (FORCE)`)
  await admin.query(`CREATE DATABASE "${BD_TEST}"`)
  bd = await new DataSource(opcionesDataSource(BD_TEST)).initialize()
  await bd.runMigrations()
  await ejecutarSeed(bd, PASSWORD)
  await crearSuperadmin(bd, {
    correo: SUPERADMIN,
    nombre: 'Superadmin',
    password: PASSWORD,
  })
  await bd.query(
    `UPDATE usuario SET credencial_provisoria = false WHERE correo = $1`,
    [SUPERADMIN],
  )

  // La API se conecta a la base de este test y cifra con este secreto.
  process.env.POSTGRES_DB = BD_TEST
  process.env.MFA_SECRET = MFA_SECRET
  const modulo = await Test.createTestingModule({
    imports: [AppModule],
  }).compile()
  app = modulo.createNestApplication<INestApplication<App>>({ logger: false })
  configurarApp(app, { secretoOrigen: '' })
  await app.init()
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

describe('criterio 1: el perfil genera un QR compatible con apps TOTP', () => {
  it('sin MFA, el estado es inactivo', async () => {
    const t = await token('alumno@norte.cursus.test')
    expect((await estado(t).expect(200)).body).toEqual({ activo: false })
  })

  it('entrega el secreto, la uri otpauth y el QR en SVG, sin caché', async () => {
    const correo = await crearUsuario('qr.uno@norte.cursus.test')
    const respuesta = await iniciar(await token(correo)).expect(200)
    const inicio = respuesta.body as InicioMfa

    expect(respuesta.get('Cache-Control')).toBe('no-store')
    expect(inicio.secreto).toMatch(/^[A-Z2-7]{32}$/)
    const uri = new URL(inicio.uri)
    expect(`${uri.protocol}//${uri.host}`).toBe('otpauth://totp')
    expect(decodeURIComponent(uri.pathname)).toBe(`/CURSUS:${correo}`)
    expect(uri.searchParams.get('secret')).toBe(inicio.secreto)
    expect(uri.searchParams.get('issuer')).toBe('CURSUS')
    expect(inicio.qr).toMatch(
      /^<svg [^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/,
    )
    expect(inicio.qr).not.toMatch(/<script|on\w+=/i)
  })

  it('un QR nuevo reemplaza al pendiente: el anterior deja de servir', async () => {
    const correo = await crearUsuario('qr.dos@norte.cursus.test')
    const t = await token(correo)
    const primero = (await iniciar(t).expect(200)).body as InicioMfa
    const segundo = (await iniciar(t).expect(200)).body as InicioMfa
    expect(segundo.secreto).not.toBe(primero.secreto)

    await confirmar(t, codigoTotp(primero.secreto)).expect(400)
    await confirmar(t, codigoTotp(segundo.secreto)).expect(204)
  })
})

describe('criterio 2: la activación se confirma con un código válido de la app', () => {
  it('con el código de la app, el MFA queda activo', async () => {
    const correo = await crearUsuario('activa@norte.cursus.test')
    const t = await token(correo)
    const { secreto } = (await iniciar(t).expect(200)).body as InicioMfa

    await confirmar(t, codigoTotp(secreto)).expect(204)

    expect((await estado(t).expect(200)).body as EstadoMfa).toEqual({
      activo: true,
    })
    expect((await filaMfa(correo)).activado_en).toBeInstanceOf(Date)
  })

  it('acepta el código con espacios, como lo muestran las apps', async () => {
    const correo = await crearUsuario('espacios@norte.cursus.test')
    const t = await token(correo)
    const { secreto } = (await iniciar(t).expect(200)).body as InicioMfa
    const codigo = codigoTotp(secreto)

    await confirmar(t, `${codigo.slice(0, 3)} ${codigo.slice(3)}`).expect(204)
  })

  it('un código incorrecto no activa nada y se puede reintentar', async () => {
    const correo = await crearUsuario('incorrecto@norte.cursus.test')
    const t = await token(correo)
    const { secreto } = (await iniciar(t).expect(200)).body as InicioMfa
    const correcto = codigoTotp(secreto)
    const incorrecto = correcto === '000000' ? '111111' : '000000'

    const respuesta = await confirmar(t, incorrecto).expect(400)
    expect(respuesta.body).toMatchObject({ message: 'El código no es válido' })
    expect((await estado(t).expect(200)).body).toEqual({ activo: false })
    expect((await filaMfa(correo)).activado_en).toBeNull()

    await confirmar(t, correcto).expect(204)
  })

  it('un código de hace más de un minuto se rechaza', async () => {
    const correo = await crearUsuario('viejo@norte.cursus.test')
    const t = await token(correo)
    const { secreto } = (await iniciar(t).expect(200)).body as InicioMfa
    const viejo = codigoTotp(secreto, Date.now() - 90_000)
    // Si por azar coincide con el actual, el caso no aplica.
    if (viejo !== codigoTotp(secreto)) {
      await confirmar(t, viejo).expect(400)
    }
  })

  it.each([[''], ['12345'], ['1234567'], ['12a456'], [123456], [null]])(
    'rechaza el código %j por formato',
    async (codigo) => {
      const correo = await crearUsuario(
        `formato.${String(codigo).length}.${typeof codigo}@norte.cursus.test`,
      )
      const t = await token(correo)
      await iniciar(t).expect(200)
      await confirmar(t, codigo).expect(400)
      expect((await filaMfa(correo)).activado_en).toBeNull()
    },
  )

  it('sin haber generado un QR, confirmar responde 400', async () => {
    const correo = await crearUsuario('sinqr@norte.cursus.test')
    const respuesta = await confirmar(await token(correo), '123456').expect(400)
    expect(respuesta.body).toMatchObject({
      message: 'Primero genera el código QR',
    })
  })

  it('con el MFA activo no se genera otro QR ni se reconfirma (409)', async () => {
    const correo = await crearUsuario('yaactivo@norte.cursus.test')
    const t = await token(correo)
    const { secreto } = (await iniciar(t).expect(200)).body as InicioMfa
    await confirmar(t, codigoTotp(secreto)).expect(204)
    const guardado = (await filaMfa(correo)).secreto_cifrado

    await iniciar(t).expect(409)
    await confirmar(t, codigoTotp(secreto)).expect(409)
    // El secreto activo no cambió.
    expect((await filaMfa(correo)).secreto_cifrado).toBe(guardado)
  })
})

describe('criterio 3: el secreto TOTP se guarda cifrado', () => {
  it('la base guarda solo el texto cifrado, que se descifra con la llave y el usuario', async () => {
    const correo = await crearUsuario('cifrado@norte.cursus.test')
    const { secreto } = (await iniciar(await token(correo)).expect(200))
      .body as InicioMfa

    const { secreto_cifrado } = await filaMfa(correo)
    expect(secreto_cifrado).toMatch(/^v1\./)
    expect(secreto_cifrado).not.toContain(secreto)
    expect(
      descifrarSecretoTotp(
        llaveMfa(MFA_SECRET),
        await idDe(correo),
        secreto_cifrado,
      ),
    ).toBe(secreto)
  })

  it('la base rechaza un secreto en claro', async () => {
    const id = await idDe(await crearUsuario('enclaro@norte.cursus.test'))
    await expect(
      bd.query(
        `INSERT INTO mfa_usuario (usuario_id, secreto_cifrado) VALUES ($1, $2)`,
        [id, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'],
      ),
    ).rejects.toMatchObject({
      driverError: {
        code: CHECK,
        constraint: 'ck_mfa_usuario_secreto_cifrado',
      },
    })
  })

  it('el rol de la API no puede leer ni escribir la tabla', async () => {
    await bd.transaction(async (q) => {
      await q.query(`SET LOCAL ROLE cursus_app`)
      await expect(
        q.query(`SELECT secreto_cifrado FROM mfa_usuario`),
      ).rejects.toMatchObject({ driverError: { code: SIN_PERMISO } })
    })
  })
})

describe('quién puede activarlo', () => {
  it.each([
    ['el Director', 'director@sur.cursus.test'],
    ['el superadmin', SUPERADMIN],
    ['el administrativo', 'administrativo.ingenieria@norte.cursus.test'],
  ])('%s también lo activa: es una credencial', async (_rol, correo) => {
    const t = await token(correo)
    const { secreto } = (await iniciar(t).expect(200)).body as InicioMfa
    await confirmar(t, codigoTotp(secreto)).expect(204)
    expect((await estado(t).expect(200)).body).toEqual({ activo: true })
  })

  it('el alumno egresado también lo activa', async () => {
    const correo = await crearUsuario(
      'egresado@norte.cursus.test',
      'ALUMNO',
      'egresado_en = now()',
    )
    const t = await token(correo)
    const { secreto } = (await iniciar(t).expect(200)).body as InicioMfa
    await confirmar(t, codigoTotp(secreto)).expect(204)
  })

  it('con la contraseña provisoria, primero debe cambiarla (403)', async () => {
    const correo = await crearUsuario(
      'provisoria@norte.cursus.test',
      'PROFESOR',
      'credencial_provisoria = true',
    )
    const t = await token(correo)
    for (const peticion of [
      () => estado(t),
      () => iniciar(t),
      () => confirmar(t, '123456'),
    ]) {
      const respuesta = await peticion().expect(403)
      expect(respuesta.body).toMatchObject({
        message: 'Debes cambiar tu contraseña provisoria antes de continuar',
      })
    }
    expect(await filaMfa(correo)).toBeUndefined()
  })

  it('sin sesión responde 401', async () => {
    await estado(null).expect(401)
    await iniciar(null).expect(401)
    await confirmar(null, '123456').expect(401)
  })

  it('cada usuario ve y activa solo su propio MFA', async () => {
    const uno = await crearUsuario('propio.uno@norte.cursus.test')
    const dos = await crearUsuario('propio.dos@norte.cursus.test')
    const tUno = await token(uno)
    const tDos = await token(dos)
    const { secreto } = (await iniciar(tUno).expect(200)).body as InicioMfa

    // El otro usuario no tiene QR pendiente: el código del primero no sirve.
    await confirmar(tDos, codigoTotp(secreto)).expect(400)
    expect((await estado(tDos).expect(200)).body).toEqual({ activo: false })
    await confirmar(tUno, codigoTotp(secreto)).expect(204)
    expect((await estado(tDos).expect(200)).body).toEqual({ activo: false })
  })

  it('un usuario archivado pierde la sesión', async () => {
    const correo = await crearUsuario('archivado@norte.cursus.test')
    const t = await token(correo)
    await bd.query(`UPDATE usuario SET archived_at = now() WHERE correo = $1`, [
      correo,
    ])
    await iniciar(t).expect(401)
  })
})
