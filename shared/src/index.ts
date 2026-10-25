// Punto de entrada de @cursus/shared: exporta aquí los tipos y DTOs compartidos.

// Roles de usuario. Deben coincidir con el enum rol_usuario de la migración
// EsquemaInicial del backend.
export const ROLES = [
  'DIRECTOR',
  'ADMINISTRATIVO',
  'PROFESOR',
  'AYUDANTE',
  'ALUMNO',
] as const

export type Rol = (typeof ROLES)[number]

// Respuesta de GET /api/auth/yo: el usuario de la sesión.
export interface UsuarioSesion {
  id: string
  nombre: string
  correo: string
  rol: Rol
  universidadId: string
  // "Directorio" para el Director, que ve todas las universidades.
  universidadNombre: string
  facultadNombre: string | null
  // PER-03: true mientras tenga la contraseña provisoria; solo puede cambiarla.
  debeCambiarPassword: boolean
  // Período activo de su universidad, o null si no hay uno activo.
  periodoActivo: { id: string; anio: number; semestre: number } | null
}

export * from './permisos.js'
export * from './cursos.js'
export * from './periodos.js'
export * from './perfil.js'
export * from './horarios.js'
export * from './carga-alumnos.js'
export * from './espacio.js'
export * from './dashboard.js'
export * from './seccion-resumen.js'
export * from './dashboard-ayudante.js'

// GES-01: los identificadores de facultad/universidad se resuelven en la API.
export interface Carrera {
  id: string
  nombre: string
}

export const LARGO_NOMBRE_CARRERA = 150
