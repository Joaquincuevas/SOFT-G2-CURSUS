import { ChevronLeft, Menu } from 'lucide-react'
import { Fragment } from 'react'
import { Link, useLocation } from 'react-router'
import { Badge } from '@/components/ui/badge'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { useSession } from '../session/session'
import { MenuUsuario } from './MenuUsuario'
import { useMigasDinamica } from './migas-contexto'
import { migasDe, type Miga } from './migas'

interface Props {
  // Abre el panel del menú (solo bajo 1024 px, donde no hay riel fijo).
  onAbrirMenu: () => void
  menuAbierto: boolean
}

// Encabezado: el menú en pantallas angostas, el breadcrumb de la ruta y la
// cuenta. No repite el título de la página: la ruta actual es el último paso
// del breadcrumb, y el nombre de la universidad está en el menú lateral.
export function Header({ onAbrirMenu, menuAbierto }: Props) {
  const { user } = useSession()
  const { pathname } = useLocation()
  const migas = migasDe(pathname, user, useMigasDinamica())
  const { periodoActivo } = user

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-card px-4 sm:px-6 lg:px-8">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="shrink-0 lg:hidden"
        aria-label="Menú"
        aria-controls="menu-movil"
        aria-expanded={menuAbierto}
        onClick={onAbrirMenu}
      >
        <Menu />
      </Button>
      <Migas migas={migas} />
      <div className="ml-auto flex shrink-0 items-center gap-3">
        {periodoActivo && (
          <Badge variant="secondary" className="max-md:hidden">
            Semestre {periodoActivo.anio}-{periodoActivo.semestre}
          </Badge>
        )}
        <MenuUsuario />
      </div>
    </header>
  )
}

// El último paso es la página actual y es el h1. Con un solo paso (el
// Dashboard) no hay camino que mostrar: queda solo el título.
function Migas({ migas }: { migas: Miga[] }) {
  const actual = migas[migas.length - 1]
  const previas = migas.slice(0, -1)
  // En pantallas angostas el título pasa a dos líneas en vez de cortarse
  // («Bienvenido/a, Administrati…»); desde sm vuelve a una línea.
  const clasesTitulo =
    'm-0 min-w-0 text-sm leading-tight font-semibold text-primary max-sm:line-clamp-2 sm:truncate sm:text-base'

  if (previas.length === 0) {
    return (
      <div className="min-w-0 flex-1">
        <h1 className={clasesTitulo}>{actual.etiqueta}</h1>
      </div>
    )
  }

  const padre = previas[previas.length - 1]
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      {/* En pantallas angostas el camino completo no cabe: queda el título y
          un enlace al paso anterior. */}
      {padre.to && (
        <Button
          asChild
          variant="ghost"
          size="icon-sm"
          className="-ml-1 shrink-0 sm:hidden"
        >
          <Link to={padre.to} aria-label={`Volver a ${padre.etiqueta}`}>
            <ChevronLeft />
          </Link>
        </Button>
      )}
      <Breadcrumb className="min-w-0 flex-1" aria-label="Ubicación">
        <BreadcrumbList className="flex-nowrap gap-1.5 sm:gap-2">
          {previas.map((miga) => (
            <Fragment key={`${miga.to}:${miga.etiqueta}`}>
              <BreadcrumbItem className="max-sm:hidden">
                <BreadcrumbLink asChild>
                  <Link to={miga.to ?? '/'}>{miga.etiqueta}</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="max-sm:hidden" />
            </Fragment>
          ))}
          <BreadcrumbItem className="min-w-0">
            <h1 className={clasesTitulo}>
              {/* El paso actual ya es el h1: sin el role="link" de shadcn, no
                  compite con el enlace del mismo nombre en el menú lateral. */}
              <BreadcrumbPage
                role={undefined}
                aria-disabled={undefined}
                className="font-semibold text-inherit"
              >
                {actual.etiqueta}
              </BreadcrumbPage>
            </h1>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  )
}
