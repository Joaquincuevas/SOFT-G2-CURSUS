import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

// Alertas suaves: fondo muy claro, borde de intensidad media y texto oscuro del
// mismo tono (tokens --alert-* de styles/alertas.css). Un enlace dentro de la
// alerta va en negrita y subrayado (alert-link). Cada color debe ir con un
// ícono o con texto que diga el estado: el color solo no basta.
const alertVariants = cva(
  'relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-lg border px-4 py-3 text-sm has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] has-[>svg]:gap-x-3 [&>svg]:size-4 [&>svg]:translate-y-0.5',
  {
    variants: {
      variant: {
        default: 'bg-card text-card-foreground [&>svg]:text-current',
        success:
          'border-alert-success-border bg-alert-success text-alert-success-foreground *:data-[slot=alert-description]:text-current [&_a]:alert-link [&>svg]:text-current',
        danger:
          'border-alert-danger-border bg-alert-danger text-alert-danger-foreground *:data-[slot=alert-description]:text-current [&_a]:alert-link [&>svg]:text-current',
        warning:
          'border-alert-warning-border bg-alert-warning text-alert-warning-foreground *:data-[slot=alert-description]:text-current [&_a]:alert-link [&>svg]:text-current',
        info: 'border-alert-info-border bg-alert-info text-alert-info-foreground *:data-[slot=alert-description]:text-current [&_a]:alert-link [&>svg]:text-current',
        accent:
          'border-alert-accent-border bg-alert-accent text-alert-accent-foreground *:data-[slot=alert-description]:text-current [&_a]:alert-link [&>svg]:text-current',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

// Las clases van escritas completas: Tailwind solo genera las que encuentra en
// el código, no las que se arman con texto.
// danger y warning interrumpen al lector de pantalla (role="alert"); las demás
// se anuncian sin interrumpir (role="status").
const ROL_POR_VARIANTE = {
  default: 'status',
  success: 'status',
  info: 'status',
  accent: 'status',
  danger: 'alert',
  warning: 'alert',
} as const

function Alert({
  className,
  variant = 'default',
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      data-variant={variant}
      role={ROL_POR_VARIANTE[variant ?? 'default']}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  )
}

function AlertTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        'col-start-2 line-clamp-1 min-h-4 font-medium tracking-tight',
        className,
      )}
      {...props}
    />
  )
}

function AlertDescription({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        'col-start-2 grid justify-items-start gap-1 text-sm text-muted-foreground [&_p]:leading-relaxed',
        className,
      )}
      {...props}
    />
  )
}

export { Alert, AlertTitle, AlertDescription }
