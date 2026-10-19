import type { Rol } from '@cursus/shared'
import {
  Controller,
  Delete,
  Get,
  HttpCode,
  type INestApplication,
  Post,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { AppModule } from '../../src/app.module.js'
import { Puede } from '../../src/auth/permisos.decorator.js'
import { configurarApp } from '../../src/config/configurar-app.js'
import { AuthService } from '../../src/auth/auth.service.js'

// Rutas que solo existen en este test, para probar PermisosGuard con los
// guards globales reales de AppModule.
@Controller('prueba')
class PruebaController {
  @Puede('read', 'Universidad')
  @Get('universidades')
  leerUniversidades() {
    return 'ok'
  }

  @Puede('create', 'Carrera')
  @Post('carreras')
  @HttpCode(200)
  crearCarrera() {
    return 'ok'
  }

  @Puede('create', 'Usuario')
  @Post('usuarios')
  @HttpCode(200)
  crearUsuario() {
    return 'ok'
  }

  @Puede('delete', 'Usuario')
  @Delete('usuarios')
  borrarUsuario() {
    return 'ok'
  }

  // Sin declaración de permisos: debe responder 403 a todos.
  @Get('sin-declarar')
  sinDeclarar() {
    return 'ok'
  }
}

// Tokens firmados como los del backend (mismo secreto que vitest.config.e2e.ts).
const jwt = new JwtService({ secret: process.env.JWT_SECRET })
const sesionDe = (rol: string) =>
  `Bearer ${jwt.sign({
    sid: '00000000-0000-0000-0000-000000000003',
    sub: '00000000-0000-0000-0000-000000000001',
    rol,
    universidad_id: '00000000-0000-0000-0000-000000000002',
  })}`

type Metodo = 'get' | 'post' | 'delete'

interface Caso {
  rol: Rol
  permitido: [Metodo, string]
  denegado: [Metodo, string]
}

// Un acceso permitido y uno denegado por rol.
const CASOS: Caso[] = [
  {
    rol: 'DIRECTOR',
    permitido: ['get', '/api/prueba/universidades'],
    denegado: ['post', '/api/prueba/carreras'],
  },
  {
    rol: 'ADMINISTRATIVO',
    permitido: ['post', '/api/prueba/carreras'],
    denegado: ['delete', '/api/prueba/usuarios'],
  },
  {
    rol: 'PROFESOR',
    permitido: ['get', '/api/prueba/universidades'],
    denegado: ['post', '/api/prueba/carreras'],
  },
  {
    rol: 'AYUDANTE',
    permitido: ['get', '/api/prueba/universidades'],
    denegado: ['post', '/api/prueba/carreras'],
  },
  {
    rol: 'ALUMNO',
    permitido: ['get', '/api/prueba/universidades'],
    denegado: ['post', '/api/prueba/carreras'],
  },
]

describe('permisos por rol (e2e)', () => {
  let app: INestApplication<App>

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [PruebaController],
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

  const pedir = (rol: string, [metodo, ruta]: [Metodo, string]) =>
    request(app.getHttpServer())
      [metodo](ruta)
      .set('Authorization', sesionDe(rol))

  describe.each(CASOS)('$rol', ({ rol, permitido, denegado }) => {
    it(`puede: ${permitido.join(' ').toUpperCase()}`, () => {
      return pedir(rol, permitido).expect(200)
    })

    it(`responde 403: ${denegado.join(' ').toUpperCase()}`, () => {
      return pedir(rol, denegado).expect(403)
    })

    it('responde 403 en una ruta sin permisos declarados', () => {
      return pedir(rol, ['get', '/api/prueba/sin-declarar']).expect(403)
    })

    it('GET /api (solo sesión) responde 200', () => {
      return pedir(rol, ['get', '/api']).expect(200)
    })
  })

  it('el Director no puede crear usuarios', () => {
    return pedir('DIRECTOR', ['post', '/api/prueba/usuarios']).expect(403)
  })

  it('el Administrativo puede crear usuarios', () => {
    return pedir('ADMINISTRATIVO', ['post', '/api/prueba/usuarios']).expect(200)
  })

  it('responde 403 si el rol del token no existe', () => {
    return pedir('INVITADO', ['get', '/api/prueba/universidades']).expect(403)
  })

  it('responde 401 (no 403) sin token', () => {
    return request(app.getHttpServer())
      .get('/api/prueba/universidades')
      .expect(401)
  })
})
