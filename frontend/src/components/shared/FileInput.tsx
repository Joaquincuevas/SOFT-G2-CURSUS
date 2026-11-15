import { useId, useState, type ComponentProps } from 'react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Props extends Omit<
  ComponentProps<'input'>,
  'type' | 'onChange' | 'value'
> {
  onChange?: (archivos: File[]) => void
}

// Selector de archivo en español: reemplaza al input nativo («Choose File» /
// «No file chosen» según el idioma del navegador). El input nativo sigue siendo
// el control (teclado, required, formulario y lector de pantalla); solo queda
// oculto, y su etiqueta se dibuja como botón con el foco del input.
export function FileInput({
  id: idPropio,
  className,
  onChange,
  disabled,
  'aria-describedby': describedBy,
  ...props
}: Props) {
  const idAuto = useId()
  const id = idPropio ?? idAuto
  const idNombre = `${id}-nombre`
  const [nombres, setNombres] = useState<string[]>([])

  return (
    <div
      data-slot="file-input"
      className={cn('flex min-w-0 flex-wrap items-center gap-3', className)}
    >
      <input
        {...props}
        id={id}
        type="file"
        disabled={disabled}
        aria-describedby={
          [describedBy, idNombre].filter(Boolean).join(' ') || undefined
        }
        className="peer sr-only"
        onChange={(evento) => {
          const archivos = Array.from(evento.target.files ?? [])
          setNombres(archivos.map((archivo) => archivo.name))
          onChange?.(archivos)
        }}
      />
      <label
        data-slot="file-input-boton"
        htmlFor={id}
        className={cn(
          buttonVariants({ variant: 'outline' }),
          'cursor-pointer peer-focus-visible:border-ring peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50 peer-disabled:pointer-events-none peer-disabled:opacity-50 peer-aria-invalid:border-destructive',
        )}
      >
        Seleccionar archivo
      </label>
      <span
        id={idNombre}
        aria-live="polite"
        className="min-w-0 truncate text-sm text-muted-foreground"
      >
        {nombres.length > 0
          ? nombres.join(', ')
          : 'Ningún archivo seleccionado'}
      </span>
    </div>
  )
}
