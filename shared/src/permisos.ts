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

// Sujetos de tabla: uno por cada tabla del schema. 'Curso' se adelanta a la
// tabla de cursos (GES-*). Deciden qué acciones ve cada rol dentro de una
// página (crear, editar...) y qué endpoints puede usar.
export type SujetoTabla =
  'Universidad' | 'Facultad' | 'Carrera' | 'Periodo' | 'Usuario' | 'Curso'

// Sujetos de sección: no son tablas, sino las secciones del menú del frontend.
// Existen porque las secciones dependen del rol y no de los permisos sobre
// tablas (por ejemplo, el Director y el Administrativo leen las mismas
// tablas, pero ven secciones distintas). Solo se usan con 'read', y así el
// menú no cambia cuando se agregan permisos sobre tablas.
export type SujetoSeccion = 'PanelDirectorio' | 'GestionAcademica' | 'MisCursos'

// 'all' es el comodín de CASL.
export type Sujeto = SujetoTabla | SujetoSeccion | 'all'

export type AppAbility = MongoAbility<[Accion, Sujeto]>

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
      ])
      // Ve Gestión académica en solo lectura (vista consolidada).
      can('read', ['PanelDirectorio', 'GestionAcademica'])
      break
    case 'ADMINISTRATIVO':
      can('read', ['Universidad', 'Facultad'])
      can(
        ['create', 'read', 'update'],
        ['Carrera', 'Periodo', 'Curso', 'Usuario'],
      )
      can('read', 'GestionAcademica')
      break
    case 'PROFESOR':
    case 'AYUDANTE':
    case 'ALUMNO':
      // Sin permisos sobre Curso por ahora: sus cursos llegan con las secciones.
      can('read', ['Universidad', 'Facultad', 'Carrera', 'Periodo'])
      can('read', 'MisCursos')
      break
    // Un rol desconocido no recibe ningún permiso.
  }

  return build()
}
