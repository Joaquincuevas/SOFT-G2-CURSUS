import type { ReactNode } from 'react'
import { CursusLogo } from '@/components/brand/CursusLogo'
import { PanelMarca } from './PanelMarca'

interface Props {
  titulo: string
  descripcion?: ReactNode
  children: ReactNode
  // Lo que va bajo la tarjeta: enlaces o una nota.
  pie?: ReactNode
}

// Estructura común de las pantallas de acceso (login, verificación en dos
// pasos, recuperación y cambio obligatorio de contraseña): el panel de marca a
// un lado desde 1024 px y, en pantallas angostas, solo el formulario.
export function AuthLayout({ titulo, descripcion, children, pie }: Props) {
  return (
    <div className="flex min-h-svh bg-(color:--color-surface)">
      <PanelMarca />
      <main className="flex flex-1 items-center justify-center p-4 lg:p-8">
        <div className="grid w-full max-w-120 gap-6">
          {/* Sin el panel de marca, el isotipo identifica la pantalla. */}
          <p className="m-0 flex items-center gap-2.5 text-lg font-bold tracking-[2px] text-(color:--color-primary-dark) lg:hidden">
            <CursusLogo size={32} decorativo className="text-primary" />
            CURSUS
          </p>
          <div className="grid gap-1.5">
            <h1 className="m-0 text-[28px] leading-9 font-bold text-foreground">
              {titulo}
            </h1>
            {descripcion && (
              <p className="m-0 text-sm text-muted-foreground">{descripcion}</p>
            )}
          </div>
          {children}
          {pie}
        </div>
      </main>
    </div>
  )
}
