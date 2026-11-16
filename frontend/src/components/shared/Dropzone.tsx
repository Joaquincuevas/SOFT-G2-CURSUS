import { FileText, UploadCloud, X } from 'lucide-react'
import {
  useEffect,
  useId,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Props {
  // El id va al input: así una etiqueta externa (FormField) lo nombra.
  id?: string
  archivo: File | null
  onArchivoChange: (archivo: File | null) => void
  // Tipos que ofrece el selector del sistema, por ejemplo ".pdf".
  accept?: string
  // Devuelve el motivo para rechazar el archivo, o null si sirve. El archivo
  // rechazado no se entrega a quien usa el componente.
  validar?: (archivo: File) => string | null
  // Qué se puede subir, por ejemplo «PDF, hasta 10 MiB».
  descripcion?: ReactNode
  // Un error del campo que decide quien usa el componente (por ejemplo, «Elige
  // un archivo» al enviar sin uno). El motivo de un archivo rechazado manda.
  error?: string | null
  disabled?: boolean
  'aria-describedby'?: string
  'aria-label'?: string
  className?: string
}

// Tamaño para mostrar: 2048 → «2 KB».
function tamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.0', '')} MB`
}

// Zona para elegir un archivo, en español: se arrastra o se hace clic. El
// control sigue siendo el input nativo (oculto), así que funciona con el
// teclado y con los lectores de pantalla. Muestra el archivo elegido con su
// tamaño y un botón para quitarlo, y el motivo si no sirve, junto al campo.
export function Dropzone({
  id: idPropio,
  archivo,
  onArchivoChange,
  accept,
  validar,
  descripcion,
  error: errorExterno = null,
  disabled = false,
  'aria-describedby': describedBy,
  'aria-label': ariaLabel,
  className,
}: Props) {
  const idAuto = useId()
  const id = idPropio ?? idAuto
  const idDescripcion = `${id}-descripcion`
  const idError = `${id}-error`
  const entrada = useRef<HTMLInputElement>(null)
  const [rechazo, setRechazo] = useState<string | null>(null)
  const error = rechazo ?? errorExterno
  const [encima, setEncima] = useState(false)

  // Sin archivo (porque se quitó o porque el formulario se reinició), el input
  // también se vacía: elegir el mismo archivo otra vez vuelve a avisar.
  useEffect(() => {
    if (!archivo && entrada.current) entrada.current.value = ''
  }, [archivo])

  function elegir(elegido: File | undefined) {
    if (!elegido) return
    const motivo = validar?.(elegido) ?? null
    setRechazo(motivo)
    onArchivoChange(motivo ? null : elegido)
  }

  function soltar(evento: DragEvent<HTMLDivElement>) {
    evento.preventDefault()
    setEncima(false)
    if (!disabled) elegir(evento.dataTransfer.files[0])
  }

  return (
    <div data-slot="dropzone" className={cn('grid min-w-0 gap-2', className)}>
      <input
        ref={entrada}
        id={id}
        type="file"
        accept={accept}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-invalid={error ? true : undefined}
        aria-describedby={
          [
            describedBy,
            descripcion ? idDescripcion : null,
            error ? idError : null,
          ]
            .filter(Boolean)
            .join(' ') || undefined
        }
        className="peer sr-only"
        onChange={(evento) => elegir(evento.target.files?.[0])}
      />
      {archivo ? (
        <div className="flex min-w-0 items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 peer-focus-visible:ring-2 peer-focus-visible:ring-ring/70">
          <FileText
            aria-hidden="true"
            className="size-5 shrink-0 text-primary"
          />
          <div className="grid min-w-0 flex-1">
            <span className="truncate text-sm font-medium text-foreground">
              {archivo.name}
            </span>
            <span className="text-xs text-muted-foreground">
              {tamano(archivo.size)}
            </span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled}
            aria-label={`Quitar ${archivo.name}`}
            onClick={() => {
              setRechazo(null)
              onArchivoChange(null)
            }}
          >
            <X aria-hidden="true" />
          </Button>
        </div>
      ) : (
        // El clic y el arrastre llegan al input; el teclado ya lo controla el
        // input (Enter o Espacio abren el selector del sistema).
        <div
          data-encima={encima || undefined}
          onClick={() => !disabled && entrada.current?.click()}
          onDragOver={(evento) => {
            evento.preventDefault()
            if (!disabled) setEncima(true)
          }}
          onDragLeave={() => setEncima(false)}
          onDrop={soltar}
          className={cn(
            'flex min-h-28 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-input bg-muted/40 px-4 py-5 text-center transition-colors',
            'hover:border-primary/60 hover:bg-accent/40 data-[encima]:border-primary data-[encima]:bg-accent/60',
            'peer-focus-visible:border-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring/70',
            'peer-aria-invalid:border-destructive',
            disabled && 'pointer-events-none opacity-60',
          )}
        >
          <UploadCloud aria-hidden="true" className="size-6 text-primary" />
          <span className="text-sm font-medium text-foreground">
            Arrastra un archivo aquí o haz clic para seleccionar
          </span>
          {descripcion && (
            <span id={idDescripcion} className="text-xs text-muted-foreground">
              {descripcion}
            </span>
          )}
        </div>
      )}
      {archivo && descripcion && (
        <span id={idDescripcion} className="sr-only">
          {descripcion}
        </span>
      )}
      {error && (
        <p id={idError} role="alert" className="m-0 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
