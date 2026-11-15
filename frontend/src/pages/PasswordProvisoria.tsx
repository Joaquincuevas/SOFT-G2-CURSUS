import { Button } from '@/components/ui/button'
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
      <p className="m-0 text-sm break-words text-muted-foreground">
        Se creó la cuenta de {nombre} ({correo}). Su contraseña provisoria es:
      </p>
      <p className="m-0 rounded-lg border border-border bg-muted p-3 text-center text-base font-semibold break-all select-all">
        <code>{password}</code>
      </p>
      <p className="m-0 text-sm text-destructive">
        <strong>No se volverá a mostrar.</strong> Cópiala y entrégasela{' '}
        {destinatario}.
      </p>
      {copiada && (
        <p className="m-0 text-sm text-(color:--color-success)" role="status">
          Contraseña copiada.
        </p>
      )}
      {error && (
        <p className="m-0 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" type="button" onClick={() => void copiar()}>
          Copiar
        </Button>
        <Button className="w-fit" type="button" onClick={onCerrar}>
          Cerrar
        </Button>
      </div>
    </>
  )
}
