import type { Rol } from '@cursus/shared'

// Nombre de cada rol para mostrar en la interfaz (encabezado y perfil).
export const ROL_LABEL: Record<Rol, string> = {
  DIRECTOR: 'Director',
  ADMINISTRATIVO: 'Administrativo',
  PROFESOR: 'Profesor',
  AYUDANTE: 'Ayudante',
  ALUMNO: 'Alumno',
  SUPERADMIN: 'Superadmin',
}
