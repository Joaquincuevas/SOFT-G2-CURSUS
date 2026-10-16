import {
  type Accion,
  definirAbilityPara,
  type Rol,
  ROLES,
  type Sujeto,
} from '@cursus/shared'

type AccionConcreta = Exclude<Accion, 'manage'>
type SujetoConcreto = Exclude<Sujeto, 'all'>

const ACCIONES: AccionConcreta[] = ['create', 'read', 'update', 'delete']
const SUJETOS: SujetoConcreto[] = [
  'Universidad',
  'Facultad',
  'Carrera',
  'Periodo',
  'Usuario',
]
const TODO: AccionConcreta[] = ACCIONES
const LECTURA: AccionConcreta[] = ['read']

// Matriz rol × permiso esperada. Lo que no aparece está denegado.
const MATRIZ: Record<Rol, Partial<Record<SujetoConcreto, AccionConcreta[]>>> = {
  // Solo lectura, coherente con la RLS de MT-02 (ADR 0001).
  DIRECTOR: {
    Universidad: LECTURA,
    Facultad: LECTURA,
    Carrera: LECTURA,
    Periodo: LECTURA,
    Usuario: LECTURA,
  },
  ADMINISTRATIVO: {
    Universidad: LECTURA,
    Facultad: LECTURA,
    Carrera: TODO,
    Periodo: TODO,
    // Sin delete: los usuarios se archivan.
    Usuario: ['create', 'read', 'update'],
  },
  PROFESOR: {
    Universidad: LECTURA,
    Facultad: LECTURA,
    Carrera: LECTURA,
    Periodo: LECTURA,
  },
  AYUDANTE: {
    Universidad: LECTURA,
    Facultad: LECTURA,
    Carrera: LECTURA,
    Periodo: LECTURA,
  },
  ALUMNO: {
    Universidad: LECTURA,
    Facultad: LECTURA,
    Carrera: LECTURA,
    Periodo: LECTURA,
  },
}

describe('definirAbilityPara', () => {
  const casos = ROLES.flatMap((rol) =>
    SUJETOS.flatMap((sujeto) =>
      ACCIONES.map((accion) => ({
        rol,
        accion,
        sujeto,
        permitido: MATRIZ[rol][sujeto]?.includes(accion) ?? false,
      })),
    ),
  )

  it.each(casos)(
    '$rol: $accion $sujeto → $permitido',
    ({ rol, accion, sujeto, permitido }) => {
      expect(definirAbilityPara({ rol }).can(accion, sujeto)).toBe(permitido)
    },
  )

  it('ningún rol tiene manage sobre all', () => {
    for (const rol of ROLES) {
      expect(definirAbilityPara({ rol }).can('manage', 'all')).toBe(false)
    }
  })

  it('un rol desconocido no tiene permisos', () => {
    const ability = definirAbilityPara({ rol: 'INVITADO' as Rol })
    expect(ability.rules).toEqual([])
  })
})
