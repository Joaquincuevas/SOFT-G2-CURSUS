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
