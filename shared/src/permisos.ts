import {
  AbilityBuilder,
  createMongoAbility,
  type MongoAbility,
} from '@casl/ability'
import type { Rol } from './index.js'

// Permisos por rol con CASL. Los usan el backend (PermisosGuard) y el frontend
// (menú, rutas y botones), así que son la única fuente de qué puede hacer cada
// rol.
//
// Regla del cliente: nada se elimina, solo se archiva (archived_at). Por eso
// ningún rol recibe 'delete' ni 'manage' (que en CASL incluye 'delete') sobre
// ningún sujeto.

export type Accion = 'manage' | 'create' | 'read' | 'update' | 'delete'

// Sujetos de tabla: uno por cada tabla del schema. Deciden qué acciones ve
// cada rol dentro de una página (crear, editar...) y qué endpoints puede usar.
export type SujetoTabla =
  | 'Universidad'
  | 'Facultad'
  | 'Carrera'
  | 'Periodo'
  | 'Usuario'
  | 'Curso'
  | 'Seccion'
  | 'Inscripcion'
  | 'Clase'
  | 'Asistencia'
  | 'Anuncio'
  | 'Evaluacion'
  | 'Actividad'

// Sujetos de sección: no son tablas, sino las secciones del menú del frontend.
// Existen porque las secciones dependen del rol y no de los permisos sobre
// tablas (por ejemplo, el Director y el Administrativo leen las mismas
// tablas, pero ven secciones distintas). Solo se usan con 'read', y así el
// menú no cambia cuando se agregan permisos sobre tablas.
export type SujetoSeccion =
  'PanelDirectorio' | 'PanelSuperadmin' | 'GestionAcademica' | 'MisCursos'

// 'all' es el comodín de CASL.
export type Sujeto = SujetoTabla | SujetoSeccion | 'all'

export type AppAbility = MongoAbility<[Accion, Sujeto]>

const LEEN_CLASES: readonly Rol[] = ['PROFESOR', 'AYUDANTE', 'DIRECTOR']
const LEEN_ANUNCIOS: readonly Rol[] = [
  'PROFESOR',
  'AYUDANTE',
  'ALUMNO',
  'DIRECTOR',
]
const LEEN_EVALUACIONES: readonly Rol[] = [
  'PROFESOR',
  'AYUDANTE',
  'ALUMNO',
  'DIRECTOR',
]
const LEEN_ACTIVIDADES: readonly Rol[] = [
  'PROFESOR',
  'AYUDANTE',
  'ALUMNO',
  'DIRECTOR',
]

// Recibe el usuario y no solo el rol para que MT-01 pueda agregar condiciones
// por universidad_id sin cambiar la firma.
export function definirAbilityPara(usuario: { rol: Rol }): AppAbility {
  const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility)

  switch (usuario.rol) {
    case 'DIRECTOR':
      // Solo lectura, como en la RLS (MT-02): nunca manage (ADR 0001).
      can('read', [
        'Universidad',
        'Facultad',
        'Carrera',
        'Periodo',
        'Usuario',
        'Curso',
        'Seccion',
        'Inscripcion',
      ])
      // Ve Gestión académica en solo lectura (vista consolidada).
      can('read', ['PanelDirectorio', 'GestionAcademica'])
      break
    // MT-04 (ADR 0002): el superadmin trabaja en la facultad que eligió con
    // los mismos permisos del Administrativo, y además elige universidad y
    // facultad en su panel. La API resuelve en cuál trabaja (ver
    // contextoDeLaSesion); sin elegir una, las rutas de gestión le responden 403.
    case 'ADMINISTRATIVO':
    case 'SUPERADMIN':
      can('read', ['Universidad', 'Facultad'])
      can(
        ['create', 'read', 'update'],
        ['Carrera', 'Periodo', 'Curso', 'Seccion', 'Inscripcion', 'Usuario'],
      )
      can('read', 'GestionAcademica')
      // GES-23: desde su vista global crea y edita universidades y
      // facultades (archivar es un update).
      if (usuario.rol === 'SUPERADMIN') {
        can('read', 'PanelSuperadmin')
        can(['create', 'update'], ['Universidad', 'Facultad'])
      }
      break
    case 'PROFESOR':
    case 'AYUDANTE':
    case 'ALUMNO':
      can('read', ['Universidad', 'Facultad', 'Carrera', 'Periodo'])
      // ESP-06: read Seccion solo habilita los endpoints del espacio de la
      // sección, que además exigen ser integrante (IntegranteSeccionGuard).
      // Los endpoints de gestión piden otros permisos y siguen cerrados.
      can('read', 'Seccion')
      can('read', 'MisCursos')
      break
    // Un rol desconocido no recibe ningún permiso.
  }

  // ASI-01 (RN-13): clases de una sección. Las registra el profesor (el
  // controlador exige además que sea el profesor de esa sección) y las leen
  // el ayudante y el Director, este en solo lectura. El alumno ve su propia
  // asistencia en ASI-06. Nadie las borra.
  if (usuario.rol === 'PROFESOR') can('create', 'Clase')
  if (LEEN_CLASES.includes(usuario.rol)) can('read', 'Clase')

  // ASI-02 (RN-13): asistencia de una clase. La registra el profesor (el
  // controlador exige además que sea el de esa sección) y la leen los mismos
  // que las clases. El alumno ve la suya en ASI-06. Corregirla es ASI-04.
  if (usuario.rol === 'PROFESOR') can('create', 'Asistencia')
  if (LEEN_CLASES.includes(usuario.rol)) can('read', 'Asistencia')

  // ANU-01 (RN-09): anuncios de un curso. Los publica el profesor (el
  // controlador exige además que sea el profesor de la sección desde la que
  // publica) y los leen el ayudante, el alumno y el Director, este en solo
  // lectura. El Administrativo no recibe nada. Nadie los borra.
  if (usuario.rol === 'PROFESOR') can('create', 'Anuncio')
  if (LEEN_ANUNCIOS.includes(usuario.rol)) can('read', 'Anuncio')

  // NOT-01 (RN-10): evaluaciones de una sección. Las crea el profesor (el
  // controlador exige además que sea el profesor de esa sección) y las leen
  // el ayudante, el alumno y el Director, este en solo lectura. Editar es
  // NOT-03; nadie las borra.
  if (usuario.rol === 'PROFESOR') can('create', 'Evaluacion')
  if (LEEN_EVALUACIONES.includes(usuario.rol)) can('read', 'Evaluacion')

  // MAT-08 (RN-08): actividades de entrega de una sección. Las crea el
  // profesor (el controlador exige además que sea el profesor de esa sección)
  // y las leen el ayudante, el alumno y el Director, este en solo lectura.
  // El Administrativo no recibe nada. Nadie las borra.
  if (usuario.rol === 'PROFESOR') can('create', 'Actividad')
  if (LEEN_ACTIVIDADES.includes(usuario.rol)) can('read', 'Actividad')

  return build()
}
