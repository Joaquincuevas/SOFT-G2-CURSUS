import { cn } from '@/lib/utils'

// Aspecto de un ítem del menú lateral: hover suave del color de la
// universidad, foco fino solo con el teclado y, activo, fondo tenue, negrita y
// una barra fina a la izquierda.
export const claseItem = (colapsado: boolean) =>
  cn(
    'relative flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium text-muted-foreground no-underline transition-colors',
    'hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:outline-none',
    'aria-[current=page]:bg-accent aria-[current=page]:font-semibold aria-[current=page]:text-accent-foreground',
    'before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-primary before:opacity-0 aria-[current=page]:before:opacity-100',
    colapsado && 'justify-center px-0',
  )
