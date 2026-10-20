import { LARGO_MAXIMO_PASSWORD, LARGO_MINIMO_PASSWORD } from '@cursus/shared'
import { useCambiarPassword } from './useCambiarPassword'

// Cambio de contraseña del perfil (PER-02), para todos los roles, también el
// Director. Al cambiarla se cierran las demás sesiones; esta sigue abierta.
export function CambiarPassword() {
  const { campos, cambiar, completo, enviando, guardado, error, handleSubmit } =
    useCambiarPassword()

  return (
    <form
      className="perfil__tarjeta"
      aria-labelledby="titulo-cambiar-password"
      onSubmit={handleSubmit}
    >
      <h2 id="titulo-cambiar-password" className="perfil__titulo">
        Cambiar contraseña
      </h2>
      <div className="perfil__campos">
        <label className="perfil__campo">
          Contraseña actual
          <input
            className="perfil__input"
            type="password"
            name="passwordActual"
            autoComplete="current-password"
            value={campos.actual}
            onChange={(event) => cambiar('actual', event.target.value)}
            maxLength={LARGO_MAXIMO_PASSWORD}
            required
          />
        </label>
        <label className="perfil__campo">
          Contraseña nueva
          <input
            className="perfil__input"
            type="password"
            name="passwordNueva"
            autoComplete="new-password"
            value={campos.nueva}
            onChange={(event) => cambiar('nueva', event.target.value)}
            maxLength={LARGO_MAXIMO_PASSWORD}
            required
          />
        </label>
        <label className="perfil__campo">
          Repetir contraseña nueva
          <input
            className="perfil__input"
            type="password"
            name="passwordRepetida"
            autoComplete="new-password"
            value={campos.repetida}
            onChange={(event) => cambiar('repetida', event.target.value)}
            maxLength={LARGO_MAXIMO_PASSWORD}
            required
          />
        </label>
      </div>

      <p className="perfil__nota">
        Debe tener al menos {LARGO_MINIMO_PASSWORD} caracteres. Al cambiarla se
        cierran tus sesiones en otros dispositivos.
      </p>

      {error && (
        <p className="perfil__error" role="alert">
          {error}
        </p>
      )}
      {guardado && (
        <p className="perfil__exito" role="status">
          Contraseña actualizada.
        </p>
      )}

      <div>
        <button
          type="submit"
          className="perfil__boton"
          disabled={enviando || !completo}
        >
          {enviando ? 'Guardando…' : 'Cambiar contraseña'}
        </button>
      </div>
    </form>
  )
}
