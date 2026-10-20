import { LARGO_MAXIMO_PASSWORD, LARGO_MINIMO_PASSWORD } from '@cursus/shared'
import { useNavigate } from 'react-router'
import { useAuth } from '../auth/auth'
import { PanelMarca } from '../components/PanelMarca'
import { useSession } from '../session/session'
import { useCambiarPassword } from './useCambiarPassword'
import './CambioObligatorio.css'
import './Login.css'

// Cambio obligatorio de la contraseña provisoria (PER-03). Es la única
// pantalla a la que entra un usuario con la marca (ver RequireAuth). El Figma
// no la tiene: usa el panel de marca y la tarjeta del login (nodo 66:2).
export function CambioObligatorio() {
  const { cerrarSesion } = useAuth()
  const { marcarPasswordCambiada } = useSession()
  const navigate = useNavigate()
  const { campos, cambiar, enviando, error, handleSubmit } = useCambiarPassword(
    () => {
      marcarPasswordCambiada()
      void navigate('/', { replace: true })
    },
  )

  return (
    <div className="login">
      <PanelMarca />

      <main className="login__area">
        <div className="login__wrapper">
          <div className="login__heading">
            <h1 className="login__title">Cambia tu contraseña</h1>
            <p className="login__subtitle">
              Ingresaste con una contraseña provisoria. Para continuar, elige
              una nueva que solo tú conozcas.
            </p>
          </div>

          <form className="login__card" onSubmit={handleSubmit}>
            {error && (
              <p className="login__error" id="cambio-error" role="alert">
                {error}
              </p>
            )}
            <label className="login__field">
              Contraseña provisoria
              <input
                className="login__input"
                type="password"
                name="passwordActual"
                autoComplete="current-password"
                value={campos.actual}
                onChange={(event) => cambiar('actual', event.target.value)}
                maxLength={LARGO_MAXIMO_PASSWORD}
                required
              />
            </label>
            <label className="login__field">
              Contraseña nueva
              <input
                className="login__input"
                type="password"
                name="passwordNueva"
                autoComplete="new-password"
                value={campos.nueva}
                onChange={(event) => cambiar('nueva', event.target.value)}
                maxLength={LARGO_MAXIMO_PASSWORD}
                aria-describedby="cambio-requisito"
                required
              />
            </label>
            <label className="login__field">
              Repetir contraseña nueva
              <input
                className="login__input"
                type="password"
                name="passwordRepetida"
                autoComplete="new-password"
                value={campos.repetida}
                onChange={(event) => cambiar('repetida', event.target.value)}
                maxLength={LARGO_MAXIMO_PASSWORD}
                required
              />
            </label>
            <p className="login__caption" id="cambio-requisito">
              Debe tener al menos {LARGO_MINIMO_PASSWORD} caracteres.
            </p>
            <button className="login__button" type="submit" disabled={enviando}>
              {enviando ? 'Guardando…' : 'Cambiar contraseña'}
            </button>
          </form>

          <button
            className="cambio-obligatorio__salir"
            type="button"
            onClick={() => void cerrarSesion()}
          >
            Cerrar sesión
          </button>
        </div>
      </main>
    </div>
  )
}
