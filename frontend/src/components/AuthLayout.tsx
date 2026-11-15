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
      <div className="grid min-h-svh lg:grid-cols-[5fr_7fr]">
        <main className="flex items-center justify-center px-6 py-10 sm:px-12 xl:px-20">
          <div className="grid w-full max-w-xl gap-8">
            <p className="m-0 inline-flex w-fit items-center gap-2.5 rounded-full border border-border px-4 py-2 text-base font-bold tracking-[2px] text-(color:--color-primary-dark)">
              <CursusLogo size={28} decorativo className="text-primary" />
              CURSUS
            </p>
            <div className="grid gap-2">
              <h1 className="m-0 text-4xl leading-tight font-bold text-foreground xl:text-[40px]">
                {titulo}
              </h1>
              {descripcion && (
                <p className="m-0 text-base text-muted-foreground">
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
