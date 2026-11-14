import { useState } from 'react'
import { Outlet } from 'react-router'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { TooltipProvider } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { ContextoSuperadmin } from './ContextoSuperadmin'
import { Header } from './Header'
import { MigasProvider } from './MigasProvider'
import { Sidebar } from './Sidebar'

const CLAVE_COLAPSADO = 'cursus-menu-colapsado'

// El riel contraído se recuerda en este navegador, y solo cuando el usuario lo
// cambia (sin tocarlo, no se guarda nada). Sin localStorage (modo privado, sitio
// bloqueado), el menú arranca completo y no recuerda.
function useMenuColapsado() {
  const [colapsado, setColapsado] = useState(() => {
    try {
      return localStorage.getItem(CLAVE_COLAPSADO) === '1'
    } catch {
      return false
    }
  })
  const alternar = () => {
    const siguiente = !colapsado
    setColapsado(siguiente)
    try {
      localStorage.setItem(CLAVE_COLAPSADO, siguiente ? '1' : '0')
    } catch {
      // La preferencia se pierde al recargar; el menú funciona igual.
    }
  }
  return [colapsado, alternar] as const
}

// Marco de las rutas con sesión. Desde 1024 px, el menú es un riel fijo a la
// izquierda que se puede contraer a íconos; en pantallas angostas el mismo menú
// se abre como panel desde el encabezado.
export function AppShell() {
  const [menuAbierto, setMenuAbierto] = useState(false)
  const [colapsado, alternarColapsado] = useMenuColapsado()

  return (
    <TooltipProvider>
      <MigasProvider>
        <div className="min-h-svh bg-background lg:flex">
          <aside
            id="sidebar"
            className={cn(
              'sticky top-0 hidden h-svh shrink-0 border-r border-border transition-[width] duration-200 motion-reduce:transition-none lg:block',
              colapsado ? 'w-16' : 'w-[var(--sidebar-width)]',
            )}
          >
            <Sidebar colapsado={colapsado} onAlternar={alternarColapsado} />
          </aside>

          <Sheet open={menuAbierto} onOpenChange={setMenuAbierto}>
            <SheetContent
              id="menu-movil"
              side="left"
              className="w-72 max-w-[85vw] gap-0 p-0 lg:hidden"
            >
              <SheetHeader className="sr-only">
                <SheetTitle>Menú</SheetTitle>
                <SheetDescription>
                  Navegación principal de CURSUS
                </SheetDescription>
              </SheetHeader>
              <Sidebar onNavigate={() => setMenuAbierto(false)} />
            </SheetContent>
          </Sheet>

          <div className="flex min-w-0 flex-1 flex-col">
            <Header
              menuAbierto={menuAbierto}
              onAbrirMenu={() => setMenuAbierto(true)}
            />
            <main className="flex-1 p-4 sm:p-6 lg:p-8">
              <ContextoSuperadmin />
              <Outlet />
            </main>
          </div>
        </div>
      </MigasProvider>
    </TooltipProvider>
  )
}
