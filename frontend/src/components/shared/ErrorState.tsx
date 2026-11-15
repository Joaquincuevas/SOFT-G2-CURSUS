import { CursusLogo } from '@/components/brand/CursusLogo'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Props {
  mensaje: string
  onReintentar: () => void
  titulo?: string
  textoBoton?: string
  // Centrado en toda la ventana, por ejemplo en el ErrorBoundary.
  pantallaCompleta?: boolean
  className?: string
}

// Error con la acción para reintentar. No usa <Link> ni hooks del router: el
// ErrorBoundary lo muestra por fuera de BrowserRouter.
export function ErrorState({
  mensaje,
  onReintentar,
  titulo = 'No se pudo cargar',
  textoBoton = 'Reintentar',
  pantallaCompleta,
  className,
}: Props) {
  const tarjeta = (
    <section
      data-slot="error-state"
      role="alert"
      className={cn(
        'flex max-w-120 flex-col items-start gap-4 rounded-xl bg-card p-7 shadow-sm',
        pantallaCompleta && 'items-center text-center',
        className,
      )}
    >
      {pantallaCompleta && <CursusLogo size={56} className="text-primary" />}
      <h2 className="m-0 text-lg leading-[26px] font-semibold text-destructive">
        {titulo}
      </h2>
      <p className="m-0 text-sm text-muted-foreground">{mensaje}</p>
      <Button type="button" onClick={onReintentar}>
        {textoBoton}
      </Button>
    </section>
  )
  return pantallaCompleta ? (
    <main className="grid min-h-svh place-items-center bg-(color:--color-surface) p-4">
      {tarjeta}
    </main>
  ) : (
    tarjeta
  )
}
