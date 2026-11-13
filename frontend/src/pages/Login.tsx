import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router'
import { useAuth, type ResultadoMfa } from '../auth/auth'
import { PanelMarca } from '../components/PanelMarca'
import './Login.css'

// Pantalla de login del Figma (nodo 66:2).
export function Login() {
  const { token, aviso, iniciarSesion, completarMfa } = useAuth()
  const location = useLocation()
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // SEG-02: el desafío del paso 1 cuando la cuenta tiene MFA. Con él se pide
  // el código; la contraseña no se guarda.
  const [desafio, setDesafio] = useState<string | null>(null)
  const [correo, setCorreo] = useState('')
  const passwordRef = useRef<HTMLInputElement>(null)

  // Al iniciar sesión vuelve a la ruta que pidió RequireAuth, o al Dashboard.
  if (token) {
    const destino = (location.state as { from?: string } | null)?.from ?? '/'
    return <Navigate to={destino} replace />
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const datos = new FormData(event.currentTarget)
    setEnviando(true)
    setError(null)
    const correoIngresado = String(datos.get('correo'))
    const ok = await iniciarSesion(
      correoIngresado,
      String(datos.get('password')),
    )
    if (typeof ok === 'object') {
      setCorreo(correoIngresado)
      setDesafio(ok.desafio)
      setEnviando(false)
      return
    }
    if (!ok) {
      setError(
        'No pudimos iniciar sesión. Revisa tus credenciales e inténtalo nuevamente.',
      )
      setEnviando(false)
      // Conserva el correo para reintentar, pero descarta la contraseña.
      if (passwordRef.current) {
        passwordRef.current.value = ''
        passwordRef.current.focus()
      }
    }
  }

  if (desafio) {
    return (
      <div className="login">
        <PanelMarca />
        <main className="login__area">
          <VerificacionMfa
            desafio={desafio}
            completarMfa={completarMfa}
            volver={(mensaje) => {
              setDesafio(null)
              setError(mensaje)
              setEnviando(false)
            }}
            aviso={aviso}
          />
        </main>
      </div>
    )
  }

  return (
    <div className="login">
      <PanelMarca />

      <main className="login__area">
        <div className="login__wrapper">
          <div className="login__heading">
            <h1 className="login__title">Bienvenido a CURSUS</h1>
            <p className="login__subtitle">
              Ingresa con tus credenciales institucionales.
            </p>
          </div>

          <form className="login__card" onSubmit={handleSubmit}>
            <p className="login__caption">
              Usa el correo institucional asociado a tu universidad.
            </p>
            {(aviso || error) && (
              <p className="login__error" id="login-error" role="alert">
                {aviso || error}
              </p>
            )}
            <label className="login__field">
              Correo institucional
              <input
                className="login__input"
                name="correo"
                type="email"
                autoComplete="username"
                defaultValue={correo}
                placeholder="pedro.soto@universidad.cl"
                aria-describedby={aviso || error ? 'login-error' : undefined}
                required
              />
            </label>
            <label className="login__field">
              Contraseña
              <input
                ref={passwordRef}
                className="login__input"
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="Ingresa tu contraseña"
                aria-describedby={aviso || error ? 'login-error' : undefined}
                required
              />
            </label>
            <button className="login__button" type="submit" disabled={enviando}>
              Ingresar
            </button>
            <Link to="/recuperar-password">¿Olvidaste tu contraseña?</Link>
            <p className="login__caption login__note">
              <span className="login__dot" aria-hidden="true" />
              Acceso reservado a usuarios autorizados.
            </p>
          </form>

          <p className="login__caption">
            CURSUS · Plataforma web de gestión académica
          </p>
        </div>
      </main>
    </div>
  )
}

const MENSAJE_EXPIRADO =
  'La verificación expiró. Vuelve a ingresar tu correo y contraseña.'

// SEG-02: segundo paso del login con MFA. El código tiene 6 dígitos (la app lo
// muestra como «123 456»; los espacios se ignoran).
function VerificacionMfa({
  desafio,
  completarMfa,
  volver,
  aviso,
}: {
  desafio: string
  completarMfa: (desafio: string, codigo: string) => Promise<ResultadoMfa>
  volver: (mensaje: string | null) => void
  aviso: string | null
}) {
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Tras un 429, el formulario queda cerrado: reintentar solo alarga la espera.
  const [bloqueado, setBloqueado] = useState(false)
  const codigoRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    codigoRef.current?.focus()
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const codigo = String(
      new FormData(event.currentTarget).get('codigo'),
    ).replace(/\s/g, '')
    if (!/^\d{6}$/.test(codigo)) {
      setError('Ingresa los 6 dígitos del código de tu app autenticadora.')
      codigoRef.current?.focus()
      return
    }
    setEnviando(true)
    setError(null)
    const resultado = await completarMfa(desafio, codigo)
    if (resultado === 'ok') return
    if (resultado === 'desafio') return volver(MENSAJE_EXPIRADO)
    setEnviando(false)
    if (resultado === 'limitado') {
      setBloqueado(true)
      return
    }
    setError(
      resultado === 'codigo'
        ? 'El código no es válido o ya expiró. Ingresa el código actual de tu app.'
        : 'No pudimos verificar el código. Inténtalo nuevamente.',
    )
    if (codigoRef.current) {
      codigoRef.current.value = ''
      codigoRef.current.focus()
    }
  }

  const mensaje = bloqueado ? aviso : error
  return (
    <div className="login__wrapper">
      <div className="login__heading">
        <h1 className="login__title">Verificación en dos pasos</h1>
        <p className="login__subtitle">
          Ingresa el código de 6 dígitos de tu app autenticadora.
        </p>
      </div>

      <form className="login__card" onSubmit={handleSubmit} noValidate>
        <div role="alert" aria-live="assertive">
          {mensaje && (
            <p className="login__error" id="mfa-error">
              {mensaje}
            </p>
          )}
        </div>
        <label className="login__field">
          Código de verificación
          <input
            ref={codigoRef}
            className="login__input"
            name="codigo"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]*"
            maxLength={7}
            placeholder="123 456"
            disabled={bloqueado}
            aria-invalid={error ? true : undefined}
            aria-describedby={mensaje ? 'mfa-error' : undefined}
          />
        </label>
        <button
          className="login__button"
          type="submit"
          disabled={enviando || bloqueado}
        >
          {enviando ? 'Verificando…' : 'Verificar'}
        </button>
        <button
          className="login__secondary"
          type="button"
          onClick={() => volver(null)}
        >
          Volver al inicio de sesión
        </button>
      </form>
    </div>
  )
}
