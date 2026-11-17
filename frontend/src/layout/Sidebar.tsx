import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { Fragment } from 'react'
import { NavLink, useMatch } from 'react-router'
import { CursusLogo } from '@/components/brand/CursusLogo'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { claseItem } from './clase-item'
import { CursosDelMenu } from './CursosDelMenu'
import { etiquetaDe, navItemsFor, type NavItem } from '../navigation'
import { RUTA_HISTORIAL } from '../pages/HistorialAlumno'
import { useSession } from '../session/session'

interface Props {
  // Riel angosto con solo los íconos. Solo escritorio: en el panel móvil el
  // menú siempre va completo.
  colapsado?: boolean
  // Sin esto no hay botón para contraer (el panel móvil no lo tiene).
  onAlternar?: () => void
  onNavigate?: () => void
}

// Contenido del menú lateral: el mismo en el riel fijo de escritorio y en el
// panel que se abre desde el encabezado en pantallas angostas.
export function Sidebar({ colapsado = false, onAlternar, onNavigate }: Props) {
  const { user, ability } = useSession()
  // El profesor, el ayudante y el alumno tienen bajo el Dashboard la lista
  // «Mis cursos» (CursosDelMenu). El egresado solo ve su historial de notas
  // (HIS-06).
  const conCursos =
    !user.egresado &&
    (user.rol === 'PROFESOR' ||
      user.rol === 'AYUDANTE' ||
      user.rol === 'ALUMNO')
  // El alumno tiene además la página «Mis Cursos» (lista completa e
  // historial): su ítem encabeza la lista de cursos. El profesor y el
  // ayudante no tienen esa página y la lista va con un título.
  const items = navItemsFor(ability).filter(
    (item) =>
      (!user.egresado || item.to === '/mis-cursos') &&
      !(item.to === '/mis-cursos' && user.rol !== 'ALUMNO'),
  )
  const cursosDespuesDe = user.rol === 'ALUMNO' ? '/mis-cursos' : '/'

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-card">
      {/* Acento: continúa el color del encabezado sobre el menú. */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-[3px] bg-primary"
      />
      <div
        className={cn(
          'flex h-16 shrink-0 items-center gap-2.5 border-b border-border',
          colapsado ? 'justify-center px-2' : 'px-5',
        )}
      >
        {/* Con el texto al lado el isotipo es decorativo; contraído queda solo
            él y es el que lleva el nombre accesible. */}
        <CursusLogo
          size={32}
          decorativo={!colapsado}
          className="shrink-0 text-primary"
        />
        {/* El nombre se oculta al contraer; el isotipo queda. */}
        <span
          className={cn(
            'font-bold tracking-[2px] text-(color:--color-primary-dark)',
            colapsado && 'sr-only',
          )}
        >
          CURSUS
        </span>
      </div>

      <nav
        aria-label="Navegación principal"
        className="min-h-0 flex-1 overflow-y-auto p-3"
      >
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {items.map((item, i) => (
            <Fragment key={item.to}>
              {item.grupo && item.grupo !== items[i - 1]?.grupo && (
                <li
                  role="presentation"
                  className={
                    colapsado
                      ? 'mx-2 mt-2 border-t border-border'
                      : 'mt-3 px-3 pb-1 text-xs font-medium text-muted-foreground'
                  }
                >
                  {!colapsado && item.grupo}
                </li>
              )}
              <li>
                <ItemDelMenu
                  item={item}
                  colapsado={colapsado}
                  onNavigate={onNavigate}
                />
              </li>
              {item.to === cursosDespuesDe && conCursos && (
                <CursosDelMenu
                  colapsado={colapsado}
                  conTitulo={user.rol !== 'ALUMNO'}
                  onNavigate={onNavigate}
                />
              )}
            </Fragment>
          ))}
        </ul>
      </nav>

      <div className="shrink-0 border-t border-border p-3">
        {!colapsado && (
          <div className="mb-2 grid gap-0.5 px-1 text-xs text-muted-foreground">
            <p className="m-0 truncate">{user.universidadNombre}</p>
            {user.facultadNombre && (
              <p className="m-0 truncate">{user.facultadNombre}</p>
            )}
          </div>
        )}
        {onAlternar && (
          <BotonContraer colapsado={colapsado} onAlternar={onAlternar} />
        )}
      </div>
    </div>
  )
}

function ItemDelMenu({
  item,
  colapsado,
  onNavigate,
}: {
  item: NavItem
  colapsado: boolean
  onNavigate?: () => void
}) {
  const { user } = useSession()
  const enSeccion = useMatch('/mis-cursos/secciones/:id/*') !== null
  const Icono = item.icon
  const etiqueta = user.egresado ? 'Historial de notas' : etiquetaDe(item, user)

  const enlace = (
    <NavLink
      to={user.egresado ? RUTA_HISTORIAL : item.to}
      // Dentro de una sección, el ítem activo es el del curso: «Mis Cursos»
      // (su ruta padre) no se marca también.
      end={item.to === '/' || (item.to === '/mis-cursos' && enSeccion)}
      onClick={onNavigate}
      className={claseItem(colapsado)}
    >
      <Icono aria-hidden="true" className="size-5 shrink-0" />
      <span className={colapsado ? 'sr-only' : 'truncate'}>{etiqueta}</span>
    </NavLink>
  )

  if (!colapsado) return enlace
  // Con solo el ícono, el nombre aparece al pasar el mouse o al enfocar.
  return (
    <Tooltip>
      <TooltipTrigger asChild>{enlace}</TooltipTrigger>
      <TooltipContent side="right">{etiqueta}</TooltipContent>
    </Tooltip>
  )
}

function BotonContraer({
  colapsado,
  onAlternar,
}: {
  colapsado: boolean
  onAlternar: () => void
}) {
  const texto = colapsado ? 'Expandir menú' : 'Contraer menú'
  const boton = (
    <Button
      type="button"
      variant="ghost"
      size={colapsado ? 'icon' : 'sm'}
      className={cn(
        'text-muted-foreground',
        colapsado ? 'mx-auto flex' : 'w-full justify-start px-3',
      )}
      aria-label={texto}
      onClick={onAlternar}
    >
      {colapsado ? <PanelLeftOpen /> : <PanelLeftClose />}
      {!colapsado && 'Contraer menú'}
    </Button>
  )
  if (!colapsado) return boton
  return (
    <Tooltip>
      <TooltipTrigger asChild>{boton}</TooltipTrigger>
      <TooltipContent side="right">{texto}</TooltipContent>
    </Tooltip>
  )
}
