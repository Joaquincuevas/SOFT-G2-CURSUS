import { useId, type ReactNode } from 'react'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

// Lo que el control recibe para quedar unido a su etiqueta, su ayuda y su error.
export interface PropsDelControl {
  id: string
  'aria-describedby'?: string
  'aria-invalid'?: true
  required?: boolean
}

interface Props {
  etiqueta: string
  // Texto de apoyo bajo el control.
  ayuda?: ReactNode
  // Mensaje de error: marca el control como inválido y se anuncia.
  error?: ReactNode
  requerido?: boolean
  className?: string
  children: (control: PropsDelControl) => ReactNode
}

// Campo de formulario: etiqueta, control, ayuda y error. El control se dibuja
// con una función para recibir su id, aria-describedby, aria-invalid y required:
//   <FormField etiqueta="Correo" requerido>{(c) => <Input {...c} />}</FormField>
export function FormField({
  etiqueta,
  ayuda,
  error,
  requerido = false,
  className,
  children,
}: Props) {
  const id = useId()
  const idAyuda = `${id}-ayuda`
  const idError = `${id}-error`
  const describedBy =
    [ayuda ? idAyuda : null, error ? idError : null]
      .filter(Boolean)
      .join(' ') || undefined

  return (
    <div data-slot="form-field" className={cn('grid gap-2', className)}>
      <Label htmlFor={id}>
        {etiqueta}
        {requerido && (
          <span aria-hidden="true" className="text-destructive">
            *
          </span>
        )}
      </Label>
      {children({
        id,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
        required: requerido || undefined,
      })}
      {ayuda && (
        <p id={idAyuda} className="m-0 text-sm text-muted-foreground">
          {ayuda}
        </p>
      )}
      {error && (
        <p id={idError} role="alert" className="m-0 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
