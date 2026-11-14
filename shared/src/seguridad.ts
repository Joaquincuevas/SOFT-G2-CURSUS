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

// SEG-02: con la contraseña correcta y MFA activo, POST /api/auth/login no
// entrega la sesión sino este desafío (válido 5 minutos, para un solo
// inicio de sesión). El código de la app se envía con él a
// POST /api/auth/login/mfa, que responde como el login: { accessToken }.
export interface LoginMfaRequerido {
  mfaRequerido: true
  desafio: string
}

// Body de POST /api/auth/login/mfa.
export interface LoginMfa {
  desafio: string
  codigo: string
}

// El 401 de POST /api/auth/login/mfa trae un code para que la pantalla sepa
// qué hacer: volver al paso 1 si el desafío ya no sirve, o pedir otro código.
export const CODIGO_MFA_DESAFIO_INVALIDO = 'MFA_DESAFIO_INVALIDO'
export const CODIGO_MFA_CODIGO_INVALIDO = 'MFA_CODIGO_INVALIDO'
