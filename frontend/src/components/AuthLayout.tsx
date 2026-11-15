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
// pasos, recuperación y cambio obligatorio de contraseña): la página completa
// dividida en dos, con el panel de marca con la foto a la izquierda desde 1024 px y el
// formulario a la derecha. En pantallas angostas, solo el formulario.
export function AuthLayout({ titulo, descripcion, children, pie }: Props) {
  return (
    <div className="min-h-svh bg-card">
      <div className="grid min-h-svh lg:grid-cols-2">
        <main className="flex items-center justify-center px-6 py-10 sm:px-12">
          <div className="grid w-full max-w-110 gap-6">
            <p className="m-0 inline-flex w-fit items-center gap-2 rounded-full border border-border px-3.5 py-1.5 text-sm font-bold tracking-[2px] text-(color:--color-primary-dark)">
              <CursusLogo size={22} decorativo className="text-primary" />
              CURSUS
            </p>
            <div className="grid gap-1.5">
              <h1 className="m-0 text-[28px] leading-9 font-bold text-foreground">
                {titulo}
              </h1>
              {descripcion && (
                <p className="m-0 text-sm text-muted-foreground">
                  {descripcion}
                </p>
              )}
            </div>
            {children}
            {pie}
          </div>
        </main>
        <PanelMarca />
      </div>
    </div>
  )
}
