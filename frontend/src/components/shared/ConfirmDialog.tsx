import { Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { buttonVariants } from '@/components/ui/button'

interface Props {
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
  titulo: string
  descripcion: ReactNode
  // Confirmar no cierra el diálogo: quien lo usa lo cierra cuando termina (así
  // puede mostrar `cargando` mientras espera a la API).
  onConfirmar: () => void
  textoConfirmar?: string
  textoCancelar?: string
  // Para acciones que no se pueden deshacer: el botón va en el color de peligro.
  destructivo?: boolean
  cargando?: boolean
}

// Confirmación de una acción, sobre AlertDialog: el foco empieza en Cancelar,
// Escape cancela y mientras carga no se puede cerrar.
export function ConfirmDialog({
  abierto,
  onAbiertoChange,
  titulo,
  descripcion,
  onConfirmar,
  textoConfirmar = 'Confirmar',
  textoCancelar = 'Cancelar',
  destructivo = false,
  cargando = false,
}: Props) {
  return (
    <AlertDialog
      open={abierto}
      onOpenChange={(siguiente) => {
        if (!cargando) onAbiertoChange(siguiente)
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{titulo}</AlertDialogTitle>
          <AlertDialogDescription>{descripcion}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={cargando}>
            {textoCancelar}
          </AlertDialogCancel>
          <AlertDialogAction
            className={
              destructivo
                ? buttonVariants({ variant: 'destructive' })
                : undefined
            }
            disabled={cargando}
            aria-busy={cargando || undefined}
            onClick={(evento) => {
              evento.preventDefault()
              onConfirmar()
            }}
          >
            {cargando && (
              <Loader2
                aria-hidden="true"
                className="animate-spin motion-reduce:animate-none"
              />
            )}
            {textoConfirmar}
            {cargando && <span className="sr-only">Procesando…</span>}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
