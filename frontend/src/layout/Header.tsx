import { ChevronLeft, Menu } from 'lucide-react'
import { Fragment } from 'react'
import { Link, useLocation } from 'react-router'
import { Badge } from '@/components/ui/badge'
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useSession } from '../session/session'
import { MenuUsuario } from './MenuUsuario'
import { useMigasCola, usePublicarMigaActual } from './migas-contexto'
import { migasDe, type Miga } from './migas'
import { SOBRE_COLOR } from './sobre-color'

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
  const migas = migasDe(pathname, user, useMigasCola())
  usePublicarMigaActual(migas[migas.length - 1].etiqueta ?? '')
  const { periodoActivo } = user

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 bg-primary px-4 text-primary-foreground shadow-sm sm:px-6 lg:px-8">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className={cn(
          'shrink-0 border-primary-foreground/50 bg-transparent lg:hidden',
          SOBRE_COLOR,
        )}
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

// Cuántos pasos se muestran completos; con más, los intermedios pasan a un
// menú «…». Siempre quedan a la vista Inicio, el penúltimo y el último.
const MAX_PASOS = 4
const ENLACE_MIGA =
  'rounded-sm text-primary-foreground underline-offset-4 hover:text-primary-foreground hover:underline focus-visible:ring-2 focus-visible:ring-primary-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-primary focus-visible:outline-none'

// Nombre de un paso: corto y con puntos suspensivos si no cabe (el nombre
// completo, en un tooltip). Sin nombre todavía, un esqueleto: nunca un id.
function Nombre({
  texto,
  className,
}: {
  texto: string | null
  className?: string
}) {
  if (texto === null) {
    return (
      <span role="status" className="inline-flex items-center">
        <span className="sr-only">Cargando…</span>
        <Skeleton className="h-4 w-24 bg-primary-foreground/30" />
      </span>
    )
  }
  return <span className={cn('block truncate', className)}>{texto}</span>
}

function PasoConEnlace({ miga }: { miga: Miga }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <BreadcrumbLink
          asChild
          className={cn(ENLACE_MIGA, 'max-w-48 truncate')}
        >
          <Link to={miga.to ?? '/'}>
            <Nombre texto={miga.etiqueta} />
          </Link>
        </BreadcrumbLink>
      </TooltipTrigger>
      {miga.etiqueta !== null && (
        <TooltipContent>{miga.etiqueta}</TooltipContent>
      )}
    </Tooltip>
  )
}

// Pasos intermedios que no caben: un menú con sus enlaces.
function PasosOcultos({ migas }: { migas: Miga[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Ver los pasos intermedios"
        className={cn(
          'flex size-6 items-center justify-center rounded-sm hover:bg-primary-foreground/15',
          ENLACE_MIGA,
        )}
      >
        <BreadcrumbEllipsis className="size-6" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {migas.map((miga) => (
          <DropdownMenuItem key={`${miga.to}:${miga.etiqueta}`} asChild>
            <Link to={miga.to ?? '/'}>{miga.etiqueta ?? 'Cargando…'}</Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// El último paso es la página actual y es el h1. Con un solo paso (el
// Dashboard) no hay camino que mostrar: queda solo el título. En pantallas
// angostas el camino completo no cabe: queda «‹ paso anterior» y el título.
function Migas({ migas }: { migas: Miga[] }) {
  const actual = migas[migas.length - 1]
  const previas = migas.slice(0, -1)
  // En pantallas angostas el título pasa a dos líneas en vez de cortarse
  // («Bienvenido/a, Administrati…»); desde sm vuelve a una línea.
  const clasesTitulo =
    'm-0 min-w-0 text-sm leading-tight font-semibold text-primary-foreground max-sm:line-clamp-2 sm:truncate sm:text-base'

  if (previas.length === 0) {
    return (
      <div className="min-w-0 flex-1">
        <h1 className={clasesTitulo}>{actual.etiqueta}</h1>
      </div>
    )
  }

  const padre = [...previas].reverse().find((m) => m.to && m.etiqueta)
  const colapsa = migas.length > MAX_PASOS
  const ocultas = colapsa ? previas.slice(1, -1) : []
  const visibles = colapsa ? [previas[0], previas[previas.length - 1]] : previas

  return (
    <div className="flex min-w-0 flex-1 flex-col justify-center sm:block">
      {padre && (
        <Link
          to={padre.to!}
          aria-label={`Paso anterior: ${padre.etiqueta}`}
          className={cn(
            'flex max-w-full items-center gap-0.5 truncate text-xs text-primary-foreground/85 hover:text-primary-foreground sm:hidden',
            ENLACE_MIGA,
          )}
        >
          <ChevronLeft aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="truncate">{padre.etiqueta}</span>
        </Link>
      )}
      <Breadcrumb className="min-w-0" aria-label="Breadcrumb">
        <BreadcrumbList className="flex-nowrap gap-1.5 text-primary-foreground sm:gap-2">
          {visibles.map((miga, i) => (
            <Fragment key={`${miga.to}:${miga.etiqueta}`}>
              <BreadcrumbItem className="min-w-0 max-sm:hidden">
                <PasoConEnlace miga={miga} />
              </BreadcrumbItem>
              <BreadcrumbSeparator className="max-sm:hidden" />
              {i === 0 && ocultas.length > 0 && (
                <>
                  <BreadcrumbItem className="max-sm:hidden">
                    <PasosOcultos migas={ocultas} />
                  </BreadcrumbItem>
                  <BreadcrumbSeparator className="max-sm:hidden" />
                </>
              )}
            </Fragment>
          ))}
          <BreadcrumbItem className="min-w-0">
            <h1 className={clasesTitulo}>
              {/* El paso actual ya es el h1: sin el role="link" de shadcn, no
                  compite con el enlace del mismo nombre en el menú lateral. */}
              {actual.etiqueta === null ? (
                <BreadcrumbPage
                  role={undefined}
                  aria-disabled={undefined}
                  className="font-semibold text-inherit"
                >
                  <Nombre texto={null} />
                </BreadcrumbPage>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <BreadcrumbPage
                      role={undefined}
                      aria-disabled={undefined}
                      className="block truncate font-semibold text-inherit"
                    >
                      {actual.etiqueta}
                    </BreadcrumbPage>
                  </TooltipTrigger>
                  <TooltipContent>{actual.etiqueta}</TooltipContent>
                </Tooltip>
              )}
            </h1>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  )
}
