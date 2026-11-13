// SEG-01: el usuario activa la verificación en dos pasos (MFA) con una app
// autenticadora compatible con TOTP (Google Authenticator, Authy).

// Largo del código que muestra la app autenticadora.
export const DIGITOS_CODIGO_MFA = 6

// Respuesta de GET /api/perfil/mfa.
export interface EstadoMfa {
  activo: boolean
}

// Respuesta de POST /api/perfil/mfa/inicio. El secreto en base32 sirve para
// ingresarlo a mano si la app no puede leer el QR; qr es un SVG con la uri
// otpauth://. Solo se entrega mientras el MFA no está activo.
export interface InicioMfa {
  secreto: string
  uri: string
  qr: string
}

// Body de POST /api/perfil/mfa/confirmacion.
export interface ConfirmarMfa {
  codigo: string
}
