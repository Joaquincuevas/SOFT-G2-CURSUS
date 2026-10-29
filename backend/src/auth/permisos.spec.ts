import {
  type Accion,
  definirAbilityPara,
  type Rol,
  ROLES,
  type SujetoSeccion,
  type SujetoTabla,
} from '@cursus/shared'

type AccionConcreta = Exclude<Accion, 'manage'>

const ACCIONES: AccionConcreta[] = ['create', 'read', 'update', 'delete']
const SUJETOS: SujetoTabla[] = [
  'Universidad',
  'Facultad',
  'Carrera',
  'Periodo',
  'Usuario',
  'Curso',
  'Seccion',
  'Inscripcion',
  'Clase',
  'Asistencia',
  'Evaluacion',
  'Anuncio',
  'Actividad',
  'Nota',
]
const SECCIONES: SujetoSeccion[] = [
  'PanelDirectorio',
  'PanelSuperadmin',
  'GestionAcademica',
  'MisCursos',
]
// Nada se elimina, solo se archiva: nadie tiene delete.
const SIN_DELETE: AccionConcreta[] = ['create', 'read', 'update']
const LECTURA: AccionConcreta[] = ['read']

// MT-04 (ADR 0002): dentro de la facultad que eligió, el superadmin trabaja
// con los permisos del Administrativo.
const ADMINISTRATIVO: Partial<Record<SujetoTabla, AccionConcreta[]>> = {
  Universidad: LECTURA,
  Facultad: LECTURA,
  Carrera: SIN_DELETE,
  Periodo: SIN_DELETE,
  Usuario: SIN_DELETE,
  Curso: SIN_DELETE,
  Seccion: SIN_DELETE,
  Inscripcion: SIN_DELETE,
}

// Matriz rol × permiso esperada. Lo que no aparece está denegado.
const MATRIZ: Record<Rol, Partial<Record<SujetoTabla, AccionConcreta[]>>> = {
  // Solo lectura, coherente con la RLS de MT-02 (ADR 0001).
  DIRECTOR: {
    Universidad: LECTURA,
    Facultad: LECTURA,
    Carrera: LECTURA,
    Periodo: LECTURA,
    Usuario: LECTURA,
    Curso: LECTURA,
    Seccion: LECTURA,
    Inscripcion: LECTURA,
  },
  ADMINISTRATIVO: { ...ADMINISTRATIVO },
  SUPERADMIN: { ...ADMINISTRATIVO },
  PROFESOR: {
    Universidad: LECTURA,
    Facultad: LECTURA,
    Carrera: LECTURA,
    Periodo: LECTURA,
    // ESP-06: solo el espacio de sus secciones (además exige ser integrante).
    Seccion: LECTURA,
  },
  AYUDANTE: {
    Universidad: LECTURA,
    Facultad: LECTURA,
    Carrera: LECTURA,
    Periodo: LECTURA,
    // ESP-06: solo el espacio de sus secciones (además exige ser integrante).
    Seccion: LECTURA,
  },
  ALUMNO: {
    Universidad: LECTURA,
    Facultad: LECTURA,
    Carrera: LECTURA,
    Periodo: LECTURA,
    // ESP-06: solo el espacio de sus secciones (además exige ser integrante).
    Seccion: LECTURA,
  },
}

// ASI-01 (RN-13): clases de una sección. Registra el profesor; leen el
// ayudante y el Director. El alumno ve su asistencia en ASI-06 y el
// Administrativo no recibe nada.
const CLASE: Record<Rol, AccionConcreta[]> = {
  DIRECTOR: LECTURA,
  ADMINISTRATIVO: [],
  PROFESOR: ['create', 'read'],
  AYUDANTE: LECTURA,
  ALUMNO: [],
  SUPERADMIN: [],
}
for (const rol of ROLES) MATRIZ[rol].Clase = CLASE[rol]
// ASI-02 (RN-13): asistencia de una clase. La registra el profesor; la leen
// el ayudante y el Director. El alumno ve la suya en ASI-06.
for (const rol of ROLES) MATRIZ[rol].Asistencia = CLASE[rol]

// NOT-01 (RN-10): evaluaciones de una sección. Crea el profesor; leen el
// ayudante, el alumno y el Director. El Administrativo no recibe nada.
const EVALUACION: Record<Rol, AccionConcreta[]> = {
  DIRECTOR: LECTURA,
  ADMINISTRATIVO: [],
  PROFESOR: ['create', 'read'],
  AYUDANTE: LECTURA,
  ALUMNO: LECTURA,
  SUPERADMIN: [],
}
for (const rol of ROLES) MATRIZ[rol].Evaluacion = EVALUACION[rol]

// ANU-01 (RN-09): anuncios de un curso. Publica el profesor; leen el
// ayudante, el alumno y el Director. El Administrativo no recibe nada.
const ANUNCIO: Record<Rol, AccionConcreta[]> = {
  DIRECTOR: LECTURA,
  ADMINISTRATIVO: [],
  PROFESOR: ['create', 'read'],
  AYUDANTE: LECTURA,
  ALUMNO: LECTURA,
  SUPERADMIN: [],
}
for (const rol of ROLES) MATRIZ[rol].Anuncio = ANUNCIO[rol]

// MAT-08 (RN-08): actividades de entrega de una sección. Crea el profesor;
// leen el ayudante, el alumno y el Director. El Administrativo no recibe nada.
const ACTIVIDAD: Record<Rol, AccionConcreta[]> = {
  DIRECTOR: LECTURA,
  ADMINISTRATIVO: [],
  PROFESOR: ['create', 'read'],
  AYUDANTE: LECTURA,
  ALUMNO: LECTURA,
}
for (const rol of ROLES) MATRIZ[rol].Actividad = ACTIVIDAD[rol]

// NOT-05 (RN-10): notas de una evaluación. Las ingresa el ayudante; leen el
// profesor y el Director. El alumno (NOT-13) y el Administrativo no reciben
// nada.
const NOTA: Record<Rol, AccionConcreta[]> = {
  DIRECTOR: LECTURA,
  ADMINISTRATIVO: [],
  PROFESOR: LECTURA,
  AYUDANTE: ['read', 'update'],
  ALUMNO: [],
}
for (const rol of ROLES) MATRIZ[rol].Nota = NOTA[rol]

// Secciones del menú que ve cada rol (solo con read).
const MENU: Record<Rol, SujetoSeccion[]> = {
  DIRECTOR: ['PanelDirectorio', 'GestionAcademica'],
  ADMINISTRATIVO: ['GestionAcademica'],
  PROFESOR: ['MisCursos'],
  AYUDANTE: ['MisCursos'],
  ALUMNO: ['MisCursos'],
  SUPERADMIN: ['PanelSuperadmin', 'GestionAcademica'],
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

  const casosSeccion = ROLES.flatMap((rol) =>
    SECCIONES.map((seccion) => ({
      rol,
      seccion,
      permitido: MENU[rol].includes(seccion),
    })),
  )

  it.each(casosSeccion)(
    '$rol: read sección $seccion → $permitido',
    ({ rol, seccion, permitido }) => {
      const ability = definirAbilityPara({ rol })
      expect(ability.can('read', seccion)).toBe(permitido)
      // Las secciones solo se leen.
      for (const accion of ACCIONES.filter((a) => a !== 'read')) {
        expect(ability.can(accion, seccion)).toBe(false)
      }
    },
  )

  it('ningún rol tiene manage sobre all', () => {
    for (const rol of ROLES) {
      expect(definirAbilityPara({ rol }).can('manage', 'all')).toBe(false)
    }
  })

  it('ningún rol tiene manage ni delete sobre ningún sujeto', () => {
    for (const rol of ROLES) {
      const ability = definirAbilityPara({ rol })
      for (const sujeto of [...SUJETOS, ...SECCIONES]) {
        expect(ability.can('manage', sujeto)).toBe(false)
        expect(ability.can('delete', sujeto)).toBe(false)
      }
    }
  })

  it('un rol desconocido no tiene permisos', () => {
    const ability = definirAbilityPara({ rol: 'INVITADO' as Rol })
    expect(ability.rules).toEqual([])
  })
})
