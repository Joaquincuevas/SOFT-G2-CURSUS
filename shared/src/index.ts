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
