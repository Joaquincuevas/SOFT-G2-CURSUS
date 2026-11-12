import { ForbiddenException, UnauthorizedException } from '@nestjs/common'
import type { RequestConUsuario } from './jwt-auth.guard.js'
import {
  contextoDeLaSesion,
  DEBE_ELEGIR_FACULTAD,
} from './universidad-actual.decorator.js'

const UNIVERSIDAD = '00000000-0000-0000-0000-000000000001'
const FACULTAD = '00000000-0000-0000-0000-000000000002'
const USUARIO = '00000000-0000-0000-0000-000000000003'

const peticion = (datos: Partial<RequestConUsuario>) =>
  datos as RequestConUsuario

describe('contextoDeLaSesion', () => {
  it('usa la universidad y el rol del JWT', () => {
    expect(
      contextoDeLaSesion(
        peticion({
          usuario: {
            sub: USUARIO,
            rol: 'PROFESOR',
            universidad_id: UNIVERSIDAD,
          },
        }),
      ),
    ).toEqual({ universidadId: UNIVERSIDAD, rol: 'PROFESOR' })
  })

  it('responde 401 sin sesión', () => {
    expect(() => contextoDeLaSesion(peticion({}))).toThrow(
      UnauthorizedException,
    )
  })

  describe('superadmin (MT-04)', () => {
    const superadmin = {
      sub: USUARIO,
      rol: 'SUPERADMIN' as const,
      universidad_id: null,
    }

    it('responde 403 mientras no elija una facultad', () => {
      const intento = () =>
        contextoDeLaSesion(peticion({ usuario: superadmin, eleccion: null }))
      expect(intento).toThrow(ForbiddenException)
      expect(intento).toThrow(DEBE_ELEGIR_FACULTAD)
    })

    it('trabaja como Administrativo de la facultad que eligió', () => {
      expect(
        contextoDeLaSesion(
          peticion({
            usuario: superadmin,
            eleccion: { universidadId: UNIVERSIDAD, facultadId: FACULTAD },
          }),
        ),
      ).toEqual({
        universidadId: UNIVERSIDAD,
        rol: 'ADMINISTRATIVO',
        superadmin: { id: USUARIO, facultadId: FACULTAD },
      })
    })

    it('no toma una elección guardada en la sesión de otro rol', () => {
      expect(
        contextoDeLaSesion(
          peticion({
            usuario: {
              sub: USUARIO,
              rol: 'ADMINISTRATIVO',
              universidad_id: UNIVERSIDAD,
            },
            eleccion: { universidadId: 'otra', facultadId: FACULTAD },
          }),
        ),
      ).toEqual({ universidadId: UNIVERSIDAD, rol: 'ADMINISTRATIVO' })
    })
  })
})
