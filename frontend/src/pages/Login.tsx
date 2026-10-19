import { useRef, useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useAuth } from '../auth/auth'
import './Login.css'

// Pantalla de login del Figma (nodo 66:2).
export function Login() {
  const { token, aviso, iniciarSesion } = useAuth()
  const location = useLocation()
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
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
    const ok = await iniciarSesion(
      String(datos.get('correo')),
      String(datos.get('password')),
    )
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

  return (
    <div className="login">
      <aside className="login__brand">
        <div className="login__brand-top">
          <p className="login__logo">CURSUS</p>
          <span className="login__accent" aria-hidden="true" />
        </div>
        <div className="login__brand-message">
          <p className="login__brand-title">
            Gestión académica,
            <br />
            en un solo lugar.
          </p>
          <p className="login__brand-text">
            CURSUS centraliza cursos, materiales, notas y seguimiento académico
            para cada universidad.
          </p>
        </div>
        <p className="login__caption login__caption--brand">
          Sistema de Gestión Académica
        </p>
      </aside>

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
