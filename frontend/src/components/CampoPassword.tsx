import { Eye, EyeOff } from 'lucide-react'
import { useState, type ComponentProps } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface Props extends Omit<ComponentProps<typeof Input>, 'type'> {
  id: string
  // Nombre del campo, para el del botón: «Mostrar contraseña nueva».
  etiqueta: string
}

// Campo de contraseña con un botón para mostrarla u ocultarla. El botón es un
// control más del formulario (se llega con Tab) y anuncia su estado.
export function CampoPassword({ etiqueta, className, ...props }: Props) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? 'text' : 'password'}
        className={cn('h-11.5 px-3.5 pr-12', className)}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute top-1/2 right-1.5 size-8 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        aria-label={`${visible ? 'Ocultar' : 'Mostrar'} ${etiqueta.toLowerCase()}`}
        aria-pressed={visible}
        aria-controls={props.id}
        onClick={() => setVisible((actual) => !actual)}
      >
        {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
      </Button>
    </div>
  )
}
