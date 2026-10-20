import {
  LARGO_MAXIMO_PASSWORD,
  LARGO_MINIMO_PASSWORD,
  type CambiarPassword as CuerpoCambiarPassword,
} from '@cursus/shared'
import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/auth'

const VACIO = { actual: '', nueva: '', repetida: '' }

// Primer error de los campos, o null si se puede enviar. El backend valida lo
// mismo; esto evita una petición que sabemos que va a fallar.
function errorDe({ actual, nueva, repetida }: typeof VACIO): string | null {
  if (nueva.length < LARGO_MINIMO_PASSWORD) {
    return `La contraseña nueva debe tener al menos ${LARGO_MINIMO_PASSWORD} caracteres.`
  }
  if (nueva !== repetida) {
    return 'Las contraseñas nuevas no coinciden.'
  }
  if (nueva === actual) {
    return 'La contraseña nueva debe ser distinta de la actual.'
  }
  return null
}

// Cambio de contraseña (PER-02), para todos los roles, también el Director.
// Al cambiarla se cierran las demás sesiones; esta sigue abierta.
export function CambiarPassword() {
  const { fetchConSesion } = useAuth()
  const [campos, setCampos] = useState(VACIO)
  const [enviando, setEnviando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const completo = campos.actual && campos.nueva && campos.repetida

  function cambiar(campo: keyof typeof VACIO, valor: string) {
    setCampos((anteriores) => ({ ...anteriores, [campo]: valor }))
    setGuardado(false)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setGuardado(false)
    const invalido = errorDe(campos)
    setError(invalido)
    if (invalido) return

    setEnviando(true)
    try {
      const respuesta = await fetchConSesion('/api/auth/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          passwordActual: campos.actual,
          passwordNueva: campos.nueva,
        } satisfies CuerpoCambiarPassword),
      })
      if (respuesta.ok) {
        setCampos(VACIO)
        setGuardado(true)
      } else if (respuesta.status === 400) {
        const { message } = (await respuesta.json()) as {
          message?: string | string[]
        }
        setError(
          `${[message ?? 'No se pudo cambiar la contraseña'].flat()[0]}.`,
        )
      } else if (respuesta.status === 429) {
        const minutos = Math.ceil(
          Number(respuesta.headers.get('Retry-After') ?? 60) / 60,
        )
        setError(
          `Demasiados intentos fallidos. Intenta de nuevo en ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'}.`,
        )
      } else if (respuesta.status !== 401) {
        // Con 401 la sesión ya se cerró y la app volvió al login.
        setError('No se pudo cambiar la contraseña. Intenta de nuevo.')
      }
    } catch {
      setError('No se pudo cambiar la contraseña. Intenta de nuevo.')
    } finally {
      setEnviando(false)
    }
  }

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
