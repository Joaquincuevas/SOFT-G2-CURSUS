import {
  AbilityBuilder,
  createMongoAbility,
  type MongoAbility,
} from '@casl/ability'
import type { Rol } from './index.js'

// Permisos por rol con CASL. Los usan el backend (PermisosGuard) y el frontend
// (AUTH-06), así que son la única fuente de qué puede hacer cada rol.

export type Accion = 'manage' | 'create' | 'read' | 'update' | 'delete'

// Un sujeto por cada tabla que existe hoy. 'all' es el comodín de CASL.
export type Sujeto =
  'Universidad' | 'Facultad' | 'Carrera' | 'Periodo' | 'Usuario' | 'all'

export type AppAbility = MongoAbility<[Accion, Sujeto]>

// Recibe el usuario y no solo el rol para que MT-01 pueda agregar condiciones
// por universidad_id sin cambiar la firma.
export function definirAbilityPara(usuario: { rol: Rol }): AppAbility {
  const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility)

  switch (usuario.rol) {
    case 'DIRECTOR':
      // Solo lectura, como en la RLS (MT-02): nunca manage (ADR 0001).
      can('read', ['Universidad', 'Facultad', 'Carrera', 'Periodo', 'Usuario'])
      break
    case 'ADMINISTRATIVO':
      can('read', ['Universidad', 'Facultad'])
      can('manage', ['Carrera', 'Periodo'])
      // Sin delete: los usuarios se archivan con archived_at.
      can(['create', 'read', 'update'], 'Usuario')
      break
    case 'PROFESOR':
    case 'AYUDANTE':
    case 'ALUMNO':
      can('read', ['Universidad', 'Facultad', 'Carrera', 'Periodo'])
      break
    // Un rol desconocido no recibe ningún permiso.
  }

  return build()
}
