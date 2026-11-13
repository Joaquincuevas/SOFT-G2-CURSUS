import { LARGO_MAXIMO_PASSWORD, LARGO_MINIMO_PASSWORD } from '@cursus/shared'
import { useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router'
import { PanelMarca } from '../components/PanelMarca'
import './Login.css'

export function RecuperarPassword({
  restablecer = false,
}: {
  restablecer?: boolean
}) {
  const token = useLocation().hash.slice(1)
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [error, setError] = useState<string>()
  const invalido = restablecer && !/^[a-f0-9]{64}$/.test(token)
  const titulo = restablecer
    ? 'Define tu nueva contraseña'
    : 'Recupera tu contraseña'

  async function enviar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const datos = new FormData(event.currentTarget)
    const passwordNueva = datos.get('passwordNueva')
    if (restablecer && passwordNueva !== datos.get('confirmacion')) {
      setError('Las contraseñas deben coincidir.')
      return
    }
    setEnviando(true)
    setError(undefined)
    try {
      const ruta = restablecer ? 'restablecer-password' : 'recuperar-password'
      const respuesta = await fetch(`/api/auth/${ruta}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          restablecer
            ? { token, passwordNueva }
            : { correo: String(datos.get('correo')).trim() },
        ),
      })
      if (!respuesta.ok) {
        setError(
          restablecer && respuesta.status === 400
            ? 'El enlace es inválido o expiró. Solicita uno nuevo.'
            : 'No pudimos completar la solicitud. Intenta nuevamente.',
        )
        return
      }
      setEnviado(true)
      if (restablecer)
        window.history.replaceState(
          window.history.state,
          '',
          '/restablecer-password',
        )
    } catch {
      setError('No pudimos completar la solicitud. Intenta nuevamente.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="login">
      <PanelMarca />
      <main className="login__area">
        <div className="login__wrapper">
          <h1 className="login__title">{titulo}</h1>
          {enviado ? (
            <div className="login__card" role="status">
              {restablecer
                ? 'Contraseña actualizada. Ya puedes iniciar sesión.'
                : 'Si existe una cuenta asociada a ese correo, recibirás un enlace de recuperación.'}
            </div>
          ) : invalido ? (
            <p className="login__error" role="alert">
              El enlace es inválido o expiró. Solicita uno nuevo.
            </p>
          ) : (
            <form
              className="login__card"
              onSubmit={(event) => void enviar(event)}
            >
              {error && (
                <p className="login__error" role="alert">
                  {error}
                </p>
              )}
              {restablecer ? (
                <>
                  <label className="login__field">
                    Nueva contraseña
                    <input
                      className="login__input"
                      name="passwordNueva"
                      type="password"
                      autoComplete="new-password"
                      minLength={LARGO_MINIMO_PASSWORD}
                      maxLength={LARGO_MAXIMO_PASSWORD}
                      required
                    />
                  </label>
                  <label className="login__field">
                    Confirma la contraseña
                    <input
                      className="login__input"
                      name="confirmacion"
                      type="password"
                      autoComplete="new-password"
                      maxLength={LARGO_MAXIMO_PASSWORD}
                      required
                    />
                  </label>
                </>
              ) : (
                <label className="login__field">
                  Correo institucional
                  <input
                    className="login__input"
                    name="correo"
                    type="email"
                    autoComplete="email"
                    maxLength={254}
                    required
                  />
                </label>
              )}
              <button
                className="login__button"
                type="submit"
                disabled={enviando}
              >
                {restablecer ? 'Guardar contraseña' : 'Enviar enlace'}
              </button>
            </form>
          )}
          {restablecer && !enviado && (
            <Link to="/recuperar-password">Solicitar un nuevo enlace</Link>
          )}
          <Link to="/login">Volver al inicio de sesión</Link>
        </div>
      </main>
    </div>
  )
}
