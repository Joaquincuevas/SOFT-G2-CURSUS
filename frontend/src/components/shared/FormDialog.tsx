import { Loader2 } from 'lucide-react'
import { useId, useState, type FormEvent, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ConfirmDialog } from './ConfirmDialog'

interface Props {
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
  titulo: string
  descripcion?: ReactNode
  // Los campos. El foco empieza en el primero.
  children: ReactNode
  // Guarda y devuelve el mensaje de error, o null si salió bien (el diálogo
  // se cierra). Quien lo usa refresca el listado y avisa el éxito.
  onGuardar: () => Promise<string | null>
  textoGuardar?: string
  // true si hay cambios sin guardar: cerrar pide confirmar antes de perderlos.
  sucio?: boolean
}

// Diálogo para crear o editar algo: título, campos, error del servidor dentro
// del diálogo y «Guardar» / «Cancelar». Escape, clic fuera, la X y Cancelar lo
// cierran; mientras guarda no se puede cerrar y, con cambios sin guardar, se
// pide confirmar. En pantallas angostas el contenido se desplaza dentro del
// diálogo, que no pasa de la altura visible.
export function FormDialog({
  abierto,
  onAbiertoChange,
  titulo,
  descripcion,
  children,
  onGuardar,
  textoGuardar = 'Guardar cambios',
  sucio = false,
}: Props) {
  const idError = useId()
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmando, setConfirmando] = useState(false)

  const cerrar = () => {
    setError(null)
    setConfirmando(false)
    onAbiertoChange(false)
  }
  const pedirCierre = () => {
    if (guardando) return
    if (sucio) setConfirmando(true)
    else cerrar()
  }

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    setGuardando(true)
    setError(null)
    try {
      const mensaje = await onGuardar()
      if (mensaje === null) cerrar()
      else setError(mensaje)
    } catch {
      setError(
        'No pudimos guardar. Comprueba tu conexión e inténtalo de nuevo.',
      )
    } finally {
      setGuardando(false)
    }
  }

  return (
    <>
      <Dialog
        open={abierto}
        onOpenChange={(siguiente) => {
          if (siguiente) onAbiertoChange(true)
          else pedirCierre()
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{titulo}</DialogTitle>
            {descripcion ? (
              <DialogDescription>{descripcion}</DialogDescription>
            ) : (
              <DialogDescription className="sr-only">
                {titulo}
              </DialogDescription>
            )}
          </DialogHeader>
          <form
            onSubmit={(e) => void enviar(e)}
            noValidate
            className="grid gap-4"
            aria-describedby={error ? idError : undefined}
          >
            {error && (
              <p
                id={idError}
                role="alert"
                className="m-0 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </p>
            )}
            {children}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={guardando}
                onClick={pedirCierre}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={guardando}>
                {guardando && (
                  <Loader2
                    aria-hidden="true"
                    className="animate-spin motion-reduce:animate-none"
                  />
                )}
                {guardando ? 'Guardando…' : textoGuardar}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        abierto={confirmando}
        onAbiertoChange={setConfirmando}
        titulo="¿Descartar los cambios?"
        descripcion="Tienes cambios sin guardar. Si cierras, se pierden."
        textoConfirmar="Descartar"
        textoCancelar="Seguir editando"
        destructivo
        onConfirmar={cerrar}
      />
    </>
  )
}
