import { Inbox, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface Props {
  mensaje: string
  titulo?: string
  icono?: LucideIcon
  // Lo que se puede hacer a partir de aquí: un botón o un enlace.
  accion?: ReactNode
  className?: string
}

// Lugar sin contenido todavía: ícono, mensaje y, si hay algo que hacer, la
// acción. Dice qué falta y cómo seguir, no solo que está vacío.
export function EmptyState({
  mensaje,
  titulo,
  icono: Icono = Inbox,
  accion,
  className,
}: Props) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        'flex flex-col items-center gap-3 px-6 py-10 text-center',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="grid size-12 place-items-center rounded-full bg-accent text-accent-foreground"
      >
        <Icono className="size-6" />
      </span>
      {titulo && (
        <h3 className="m-0 text-base font-semibold text-foreground">
          {titulo}
        </h3>
      )}
      <p className="m-0 max-w-prose text-sm text-muted-foreground">{mensaje}</p>
      {accion}
    </div>
  )
}
