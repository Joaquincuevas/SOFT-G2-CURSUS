import { createContext, useContext } from 'react'

// Sesión real: el JWT de acceso vive solo en memoria, sin localStorage ni
// cookies. El refresh token (AUTH-04) va en una cookie HttpOnly que JavaScript
// no puede leer; con ella se renueva el JWT y se restaura la sesión al recargar.

export const AVISO_SESION_EXPIRADA = 'Tu sesión expiró, vuelve a iniciar sesión'
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

export interface AuthValue {
  // Token con el que empezó la sesión (login o restauración). Los JWT que
  // llegan al renovar no cambian este valor, para no recargar la sesión.
  token: string | null
  // true mientras se intenta restaurar la sesión al cargar la app.
  restaurando: boolean
  // Aviso para la pantalla de login, por ejemplo cuando la sesión expiró.
  aviso: string | null
  // Devuelve true si el backend aceptó las credenciales.
  iniciarSesion: (correo: string, password: string) => Promise<boolean>
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

// POST /api/auth/login. El backend además setea la cookie del refresh token.
export function pedirToken(
  correo: string,
  password: string,
): Promise<string | null> {
  return conCandado(async () => {
    try {
      const respuesta = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correo, password }),
      })
      if (respuesta.status === 429) {
        const segundos = Number(respuesta.headers.get('Retry-After'))
        throw new LoginLimitado(
          Number.isFinite(segundos) && segundos > 0 ? segundos : 900,
        )
      }
      if (!respuesta.ok) return null
      const { accessToken } = (await respuesta.json()) as {
        accessToken: string
      }
      return accessToken
    } catch (error) {
      if (error instanceof LoginLimitado) throw error
      return null
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
