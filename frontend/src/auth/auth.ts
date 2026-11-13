import { createContext, useContext } from 'react'

// Sesión real: el JWT de acceso vive solo en memoria, sin localStorage ni
// cookies. El refresh token (AUTH-04) va en una cookie HttpOnly que JavaScript
// no puede leer; con ella se renueva el JWT y se restaura la sesión al recargar.

export const AVISO_SESION_EXPIRADA = 'Tu sesión expiró, vuelve a iniciar sesión'
// Pantalla del cambio obligatorio de la contraseña provisoria (PER-03).
export const RUTA_CAMBIO_OBLIGATORIO = '/cambiar-password'
// Solo una marca de cierre; nunca se guardan credenciales en localStorage.
export const SESION_CERRADA = 'cursus-sesion-cerrada'

export class LoginLimitado extends Error {
  constructor(segundos: number) {
    const minutos = Math.max(1, Math.ceil(segundos / 60))
    super(
      `Demasiados intentos fallidos. Espera ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'} antes de volver a intentar.`,
    )
  }
}

export type ResultadoMfa = 'ok' | 'codigo' | 'desafio' | 'limitado' | 'error'

export interface AuthValue {
  // Token con el que empezó la sesión (login o restauración). Los JWT que
  // llegan al renovar no cambian este valor, para no recargar la sesión.
  token: string | null
  // true mientras se intenta restaurar la sesión al cargar la app.
  restaurando: boolean
  // Aviso para la pantalla de login, por ejemplo cuando la sesión expiró.
  aviso: string | null
  // Devuelve true si el backend aceptó las credenciales; { desafio } si son
  // correctas pero la cuenta tiene MFA activo (SEG-02): falta el código.
  iniciarSesion: (
    correo: string,
    password: string,
  ) => Promise<boolean | { desafio: string }>
  // SEG-02: segundo paso con el código de la app. 'limitado' deja el aviso con
  // la espera (rate limit); 'desafio' es que la verificación ya expiró.
  completarMfa: (desafio: string, codigo: string) => Promise<ResultadoMfa>
  // Único punto de cierre de sesión: todo logout pasa por aquí.
  cerrarSesion: (aviso?: string) => Promise<void>
  // fetch con el JWT de la sesión. Ante un 401 renueva el JWT una vez y
  // reintenta; si no se puede, cierra la sesión con AVISO_SESION_EXPIRADA.
  fetchConSesion: (ruta: string, init?: RequestInit) => Promise<Response>
}

export const AuthContext = createContext<AuthValue | null>(null)

export function useAuth(): AuthValue {
  const auth = useContext(AuthContext)
  if (!auth) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return auth
}

// POST a una ruta de /api/auth que responde { accessToken }. Devuelve null si
// responde con error o el backend no responde.
async function pedirAccessToken(
  ruta: string,
  init: RequestInit = {},
): Promise<string | null> {
  try {
    const respuesta = await fetch(ruta, { method: 'POST', ...init })
    if (!respuesta.ok) return null
    const { accessToken } = (await respuesta.json()) as { accessToken: string }
    return accessToken
  } catch {
    return null
  }
}

// Espera de un 429, del login o del código MFA.
function limitadoPor(respuesta: Response): LoginLimitado {
  const segundos = Number(respuesta.headers.get('Retry-After'))
  return new LoginLimitado(
    Number.isFinite(segundos) && segundos > 0 ? segundos : 900,
  )
}

// POST /api/auth/login. El backend además setea la cookie del refresh token.
// Con MFA activo no hay sesión todavía: devuelve { desafio } (SEG-02).
export function pedirToken(
  correo: string,
  password: string,
): Promise<string | { desafio: string } | null> {
  return conCandado(async () => {
    try {
      const respuesta = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correo, password }),
      })
      if (respuesta.status === 429) throw limitadoPor(respuesta)
      if (!respuesta.ok) return null
      const cuerpo = (await respuesta.json()) as {
        accessToken?: string
        mfaRequerido?: boolean
        desafio?: string
      }
      if (cuerpo.mfaRequerido && cuerpo.desafio) {
        return { desafio: cuerpo.desafio }
      }
      return cuerpo.accessToken ?? null
    } catch (error) {
      if (error instanceof LoginLimitado) throw error
      return null
    }
  })
}

// POST /api/auth/login/mfa (SEG-02): el desafío del paso 1 y el código de la
// app. Devuelve el JWT, o por qué no: 'codigo' (inválido o ya usado),
// 'desafio' (la verificación expiró: hay que volver al paso 1) o 'error'. Un
// 429 lanza LoginLimitado, como el login.
export function pedirTokenMfa(
  desafio: string,
  codigo: string,
): Promise<string | Exclude<ResultadoMfa, 'ok' | 'limitado'>> {
  return conCandado(async () => {
    try {
      const respuesta = await fetch('/api/auth/login/mfa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ desafio, codigo }),
      })
      if (respuesta.status === 429) throw limitadoPor(respuesta)
      if (respuesta.ok) {
        const { accessToken } = (await respuesta.json()) as {
          accessToken: string
        }
        return accessToken
      }
      if (respuesta.status === 401) {
        const cuerpo = (await respuesta.json().catch(() => ({}))) as {
          code?: string
        }
        return cuerpo.code === 'MFA_DESAFIO_INVALIDO' ? 'desafio' : 'codigo'
      }
      return respuesta.status === 400 ? 'codigo' : 'error'
    } catch (error) {
      if (error instanceof LoginLimitado) throw error
      return 'error'
    }
  })
}

// Refresh en curso, compartido: si varios pedidos reciben 401 a la vez, todos
// esperan la misma renovación. El backend rota el refresh token, así que dos
// renovaciones con la misma cookie se verían como un reuso y cerrarían todas
// las sesiones del usuario.
let renovacionEnCurso: Promise<string | null> | null = null

// POST /api/auth/refresh. Devuelve un JWT nuevo, o null si la cookie no sirve.
export function renovarToken(): Promise<string | null> {
  if (localStorage.getItem(SESION_CERRADA)) return Promise.resolve(null)
  renovacionEnCurso ??= conCandado(() =>
    localStorage.getItem(SESION_CERRADA)
      ? Promise.resolve(null)
      : pedirAccessToken('/api/auth/refresh'),
  ).finally(() => {
    renovacionEnCurso = null
  })
  return renovacionEnCurso
}

// Con Web Locks, las renovaciones también se turnan entre pestañas: la segunda
// ya envía la cookie que dejó la primera. Sin Web Locks (jsdom), queda solo la
// promesa compartida de esta pestaña.
function conCandado<T>(tarea: () => Promise<T>): Promise<T> {
  const locks = globalThis.navigator?.locks
  return locks ? locks.request('cursus-refresh', tarea) : tarea()
}

// POST /api/auth/logout: el backend revoca el refresh token y borra la cookie.
// Si falla se ignora: la sesión se cierra igual en el navegador.
export async function pedirLogout(): Promise<void> {
  try {
    // La cookie rotada por una renovación pendiente debe llegar antes del
    // logout. Web Locks también serializa estas operaciones entre pestañas.
    await renovacionEnCurso
    await conCandado(() => fetch('/api/auth/logout', { method: 'POST' }))
  } catch {
    // La marca de cierre impide restaurar la cookie incluso sin conexión.
  }
}
