// PER-01: el usuario edita su propio perfil. Solo el nombre es editable;
// correo, rol y universidad son de solo lectura.

export const LARGO_NOMBRE_USUARIO = 120

// Body de PATCH /api/perfil.
export interface ActualizarPerfil {
  nombre: string
}

// Respuesta de PATCH /api/perfil: el nombre como quedó guardado.
export interface PerfilActualizado {
  nombre: string
}

// PER-02: política mínima de la contraseña. El máximo es el mismo del login:
// argon2 procesa la contraseña completa.
export const LARGO_MINIMO_PASSWORD = 8
export const LARGO_MAXIMO_PASSWORD = 256

// Body de PUT /api/auth/password. La repetición de la contraseña nueva se
// valida en el frontend.
export interface CambiarPassword {
  passwordActual: string
  passwordNueva: string
}
