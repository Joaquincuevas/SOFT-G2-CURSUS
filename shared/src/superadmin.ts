// MT-04: el superadmin elige una universidad y una facultad, y dentro de ella
// trabaja con las vistas del Administrativo. GES-23: además crea, edita y
// archiva universidades y facultades desde su vista global.

export interface FacultadElegible {
  id: string
  nombre: string
}

// Respuesta de GET /api/superadmin/universidades: las universidades vigentes,
// cada una con sus facultades vigentes.
export interface UniversidadElegible {
  id: string
  nombre: string
  dominioCorreo: string
  // Hex en minúsculas (#rrggbb). UI-04 lo usa como tema.
  color: string
  facultades: FacultadElegible[]
}

// Body de PUT /api/superadmin/contexto. Responde con el UsuarioSesion nuevo.
export interface ElegirContexto {
  universidadId: string
  facultadId: string
}

export const LARGO_NOMBRE_UNIVERSIDAD = 150
export const LARGO_NOMBRE_FACULTAD = 150
export const LARGO_DOMINIO_CORREO = 253

// Dominio del correo institucional (por ejemplo, norte.cursus.test): el
// mismo formato que exige la base (ck_universidad_dominio_correo).
export const FORMATO_DOMINIO_CORREO =
  /^[a-z0-9]([a-z0-9-]*[a-z0-9])?([.][a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/

// Color de la universidad (ck_universidad_color).
export const FORMATO_COLOR = /^#[0-9a-f]{6}$/

// Color de CURSUS, el de una universidad que no eligió otro.
export const COLOR_CURSUS = '#1b4f72'

// Body de POST /api/superadmin/universidades. El dominio y el color se
// guardan en minúsculas.
export interface CrearUniversidad {
  nombre: string
  dominioCorreo: string
  color: string
}

// Body de PATCH /api/superadmin/universidades/:id: solo lo que cambia. El
// dominio solo se cambia mientras la universidad no tenga usuarios.
export type EditarUniversidad = Partial<CrearUniversidad>

// Archivar una universidad corta a todos sus usuarios y no se deshace por la
// API: el motivo es obligatorio y queda en superadmin_cambio.
export const LARGO_MOTIVO_ARCHIVAR = 500

// Body de PATCH /api/superadmin/universidades/:id/archivar.
export interface ArchivarUniversidad {
  motivo: string
}

// Respuesta de GET /api/superadmin/universidades/:id/usuarios-afectados: los
// usuarios vigentes que dejarían de poder iniciar sesión al archivarla.
export interface UsuariosAfectados {
  usuarios: number
}

// Body de POST /api/superadmin/universidades/:id/facultades y de
// PATCH /api/superadmin/facultades/:id.
export interface GuardarFacultad {
  nombre: string
}

// GES-24: roles de las cuentas que crea el superadmin. Otro superadmin solo se
// crea con el comando de MT-04.
export const ROLES_CUENTA = [
  'DIRECTOR',
  'ADMINISTRATIVO',
  'PROFESOR',
  'AYUDANTE',
  'ALUMNO',
] as const
export type RolCuenta = (typeof ROLES_CUENTA)[number]

// Body de POST /api/superadmin/universidades/:id/cuentas y de
// PATCH /api/superadmin/universidades/:id/cuentas/:cuentaId. La facultad se
// envía solo para un Administrativo, que debe tener una.
export interface GuardarCuenta {
  nombre: string
  correo: string
  rol: RolCuenta
  facultadId?: string
}

// Elemento de GET /api/superadmin/universidades/:id/cuentas: las cuentas
// vigentes de la universidad.
export interface CuentaUniversidad {
  id: string
  nombre: string
  correo: string
  rol: RolCuenta
  egresado?: boolean
  facultad: FacultadElegible | null
}

// Respuesta de POST .../cuentas. La contraseña provisoria solo va en esta
// respuesta y no se puede volver a pedir.
export interface CuentaCreada {
  cuenta: CuentaUniversidad
  passwordProvisoria: string
}
