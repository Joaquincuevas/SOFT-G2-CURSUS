import { ChevronLeft, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { Fragment } from 'react'
import { Link, NavLink, useLocation, useMatch, useNavigate } from 'react-router'
import { CursusLogo } from '@/components/brand/CursusLogo'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { NativeSelect } from '@/components/ui/native-select'
import { cn } from '@/lib/utils'
import {
  etiquetaDeVista,
  rutaVista,
  vistaDe,
  VISTAS_CURSO,
  type VistaId,
} from '../pages/vistasCurso'
import { useCursoActual } from './curso-contexto'
import { etiquetaDe, navItemsFor, type NavItem } from '../navigation'
import { RUTA_HISTORIAL } from '../pages/HistorialAlumno'
import { RUTA_MIS_SECCIONES } from '../pages/misSecciones'
import { RUTA_SECCIONES_ALUMNO } from '../pages/SeccionesAlumno'
import { RUTA_SECCIONES_AYUDANTE } from '../pages/SeccionesAyudante'
import { useDatos } from '../pages/useDatos'
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
  // El egresado solo ve su historial de notas (HIS-06). Profesor y ayudante
  // tienen pocos cursos y los ven en el Dashboard: «Mis Cursos» es del alumno.
  const items = navItemsFor(ability).filter(
    (item) =>
      (!user.egresado || item.to === '/mis-cursos') &&
      !(
        item.to === '/mis-cursos' &&
        (user.rol === 'PROFESOR' || user.rol === 'AYUDANTE')
      ),
  )

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
              {item.to === '/' && (
                <MenuDelCurso colapsado={colapsado} onNavigate={onNavigate} />
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

// Aspecto de un ítem del menú: hover suave del color de la universidad, foco
// fino solo con el teclado y, activo, fondo tenue, negrita y una barra fina a
// la izquierda.
const claseItem = (colapsado: boolean) =>
  cn(
    'relative flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium text-muted-foreground no-underline transition-colors',
    'hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:outline-none',
    'aria-[current=page]:bg-accent aria-[current=page]:font-semibold aria-[current=page]:text-accent-foreground',
    'before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-primary before:opacity-0 aria-[current=page]:before:opacity-100',
    colapsado && 'justify-center px-0',
  )

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
  const Icono = item.icon
  const etiqueta = user.egresado ? 'Historial de notas' : etiquetaDe(item, user)

  const enlace = (
    <NavLink
      to={user.egresado ? RUTA_HISTORIAL : item.to}
      end={item.to === '/'}
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

// Dentro de una sección (/mis-cursos/secciones/:id y sus subvistas), el menú
// muestra bajo el Dashboard el curso abierto y sus vistas (VISTAS_CURSO). La
// activa sale de ?vista=. Con el menú contraído quedan solo los íconos.
function MenuDelCurso({
  colapsado,
  onNavigate,
}: {
  colapsado: boolean
  onNavigate?: () => void
}) {
  const enSeccion = useMatch('/mis-cursos/secciones/:id/*')
  const curso = useCursoActual()
  const { search } = useLocation()
  const { user } = useSession()
  if (!enSeccion || !curso) return null
  const activa = vistaDe(new URLSearchParams(search).get('vista'))
  const titulo = `${curso.codigo} · ${curso.nombre}`

  return (
    <li
      aria-label={`Menú del curso ${titulo}`}
      className="mt-2 grid gap-1 border-t border-border pt-2"
    >
      {colapsado ? (
        <span className="sr-only">{titulo}</span>
      ) : (
        <Link
          to="/"
          onClick={onNavigate}
          className="group grid gap-0.5 rounded-md px-3 py-2 no-underline hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:outline-none"
        >
          <span className="flex items-start gap-1.5 text-sm font-semibold text-foreground">
            <ChevronLeft
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
            />
            <span className="min-w-0 break-words">{titulo}</span>
          </span>
          <span className="pl-5.5 text-xs text-muted-foreground">
            Sección {curso.numero} · Volver al Dashboard
          </span>
        </Link>
      )}
      {!colapsado && (
        <SelectorDeCurso
          actual={curso.seccionId}
          vista={activa}
          onNavigate={onNavigate}
        />
      )}
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {VISTAS_CURSO.map(({ id, icono: Icono }) => {
          const etiqueta = etiquetaDeVista(id, user.rol)
          const enlace = (
            <Link
              to={rutaVista(curso.seccionId, id)}
              onClick={onNavigate}
              aria-current={id === activa ? 'page' : undefined}
              className={claseItem(colapsado)}
            >
              <Icono aria-hidden="true" className="size-5 shrink-0" />
              <span className={colapsado ? 'sr-only' : 'truncate'}>
                {etiqueta}
              </span>
            </Link>
          )
          return (
            <li key={id}>
              {colapsado ? (
                <Tooltip>
                  <TooltipTrigger asChild>{enlace}</TooltipTrigger>
                  <TooltipContent side="right">{etiqueta}</TooltipContent>
                </Tooltip>
              ) : (
                enlace
              )}
            </li>
          )
        })}
      </ul>
    </li>
  )
}

const RUTA_DE_SECCIONES: Record<string, string | undefined> = {
  ALUMNO: RUTA_SECCIONES_ALUMNO,
  PROFESOR: RUTA_MIS_SECCIONES,
  AYUDANTE: RUTA_SECCIONES_AYUDANTE,
}

// Cambia de curso sin pasar por el Dashboard: lista las secciones del período
// del usuario (las mismas del Dashboard) y abre la misma vista en la elegida.
// Con un solo curso no hay a dónde cambiar.
function SelectorDeCurso({
  actual,
  vista,
  onNavigate,
}: {
  actual: string
  vista: VistaId
  onNavigate?: () => void
}) {
  const { user } = useSession()
  const navegar = useNavigate()
  const [secciones] = useDatos<
    { id: string; numero: number; curso: { codigo: string; nombre: string } }[]
  >(RUTA_DE_SECCIONES[user.rol] ?? null)
  if (!secciones || secciones.length < 2) return null
  return (
    <NativeSelect
      aria-label="Cambiar de curso"
      className="mx-3 w-[calc(100%-1.5rem)]"
      value={actual}
      onChange={(evento) => {
        void navegar(rutaVista(evento.target.value, vista))
        onNavigate?.()
      }}
    >
      {secciones.map((s) => (
        <option key={s.id} value={s.id}>
          {s.curso.codigo} · Sección {s.numero}
        </option>
      ))}
    </NativeSelect>
  )
}
