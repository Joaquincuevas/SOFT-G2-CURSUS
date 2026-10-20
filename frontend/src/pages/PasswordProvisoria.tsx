import { useState } from 'react'

// Contraseña provisoria de una cuenta recién creada (GES-15 y GES-21), que se
// muestra una sola vez: el backend no la puede volver a entregar. Quien la usa
// la guarda solo en su estado y la descarta al cerrar (nada en localStorage).
export function PasswordProvisoria({
  nombre,
  correo,
  password,
  destinatario,
  onCerrar,
}: {
  nombre: string
  correo: string
  password: string
  // A quién se le entrega: "al alumno", "al profesor"…
  destinatario: string
  onCerrar: () => void
}) {
  const [copiada, setCopiada] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function copiar() {
    try {
      await navigator.clipboard.writeText(password)
      setCopiada(true)
    } catch {
      setError('No se pudo copiar; cópiala a mano.')
    }
  }

  return (
    <>
      <p className="cursos__mensaje">
        Se creó la cuenta de {nombre} ({correo}). Su contraseña provisoria es:
      </p>
      <p className="cursos__password">
        <code>{password}</code>
      </p>
      <p className="cursos__error">
        <strong>No se volverá a mostrar.</strong> Cópiala y entrégasela{' '}
        {destinatario}.
      </p>
      {copiada && (
        <p className="cursos__exito" role="status">
          Contraseña copiada.
        </p>
      )}
      {error && (
        <p className="cursos__error" role="alert">
          {error}
        </p>
      )}
      <div className="cursos__acciones">
        <button
          className="cursos__boton cursos__boton--secundario"
          type="button"
          onClick={() => void copiar()}
        >
          Copiar
        </button>
        <button className="cursos__boton" type="button" onClick={onCerrar}>
          Cerrar
        </button>
      </div>
    </>
  )
}
