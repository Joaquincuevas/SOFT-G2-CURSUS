import { CircleAlert, Info, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'

const ICONOS = { danger: CircleAlert, warning: TriangleAlert, info: Info }

interface Props {
  // danger: error; warning: bloqueo o intentos agotados; info: aviso.
  variante: keyof typeof ICONOS
  id?: string
  children: ReactNode
}

// Mensaje de las pantallas de acceso. Los tres se anuncian al lector de
// pantalla al aparecer (role="alert"), y el ícono acompaña al color.
export function AlertaAcceso({ variante, id, children }: Props) {
  const Icono = ICONOS[variante]
  return (
    <Alert id={id} variant={variante} role="alert">
      <Icono aria-hidden="true" />
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  )
}
