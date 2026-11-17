import { ChevronDown } from 'lucide-react'
import { useId, useState } from 'react'
import { Link, useLocation, useMatch } from 'react-router'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { rutaSeccion } from '../pages/misSecciones'
import {
  etiquetaDeVista,
  rutaVista,
  vistaDe,
  VISTAS_CURSO,
  type VistaId,
} from '../pages/vistasCurso'
import { useSession } from '../session/session'
import { claseItem } from './clase-item'
import { useCursoActual } from './curso-contexto'
import { iniciales } from './iniciales'
import { useMisSecciones } from './secciones-contexto'

interface Curso {
  id: string
  numero: number
  codigo: string
  nombre: string
}

// «Mis cursos» en el menú lateral del profesor, el ayudante y el alumno: las
// secciones del período, cada una como un acordeón con las vistas del curso
// (VISTAS_CURSO). Solo una abierta a la vez: la del curso de la ruta, o la que
// el usuario abra con el chevron. Con un solo curso, abierta de partida. El
// nombre del curso lleva a su Home.
export function CursosDelMenu({
  colapsado,
  conTitulo,
  onNavigate,
}: {
  colapsado: boolean
  // El alumno no lleva título: la lista va bajo su ítem «Mis Cursos».
  conTitulo: boolean
  onNavigate?: () => void
}) {
  const { user } = useSession()
  const [secciones, recargar] = useMisSecciones()
  const enCurso = useMatch('/mis-cursos/secciones/:id/*')
  const actual = enCurso?.params.id ?? null
  const cursoActual = useCursoActual()
  const vista = vistaDe(new URLSearchParams(useLocation().search).get('vista'))

  const cursos: Curso[] = (secciones ?? []).map((s) => ({
    id: s.id,
    numero: s.numero,
    codigo: s.curso.codigo,
    nombre: s.curso.nombre,
  }))
  // Un curso abierto que no está en la lista del período (por ejemplo, de un
  // enlace directo) también aparece, para no perder su menú.
  if (
    actual &&
    cursoActual?.seccionId === actual &&
    !cursos.some((c) => c.id === actual)
  )
    cursos.unshift({
      id: actual,
      numero: cursoActual.numero,
      codigo: cursoActual.codigo,
      nombre: cursoActual.nombre,
    })

  // undefined: el usuario no tocó el chevron desde la última navegación, y
  // manda la ruta. Al cambiar de curso por la ruta se vuelve a ese estado.
  const [elegido, setElegido] = useState<string | null | undefined>(undefined)
  const [rutaPrevia, setRutaPrevia] = useState(actual)
  if (rutaPrevia !== actual) {
    setRutaPrevia(actual)
    setElegido(undefined)
  }
  const abierto =
    elegido !== undefined
      ? elegido
      : (actual ?? (cursos.length === 1 ? cursos[0].id : null))

  const titulo = 'Mis cursos'
  return (
    <li className={cn('grid gap-1', conTitulo ? 'mt-3' : 'mt-1')}>
      {colapsado ? (
        <span aria-hidden="true" className="mx-2 border-t border-border" />
      ) : (
        conTitulo && (
          <span className="px-3 text-xs font-medium text-muted-foreground">
            {titulo}
          </span>
        )
      )}
      {secciones === undefined && cursos.length === 0 ? (
        <div role="status" className="grid gap-1 px-1">
          <span className="sr-only">Cargando la lista de cursos…</span>
          <Skeleton className="h-10 rounded-md" />
          <Skeleton className="h-10 rounded-md" />
        </div>
      ) : secciones === null && cursos.length === 0 ? (
        !colapsado && (
          <p className="m-0 grid gap-1 px-3 text-xs text-muted-foreground">
            No se pudo cargar la lista de cursos.
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto justify-start p-0 text-xs"
              aria-label="Reintentar la lista de cursos"
              onClick={recargar}
            >
              Reintentar
            </Button>
          </p>
        )
      ) : cursos.length === 0 ? (
        !colapsado && (
          <p className="m-0 px-3 text-xs text-muted-foreground">
            Sin cursos en el período activo.
          </p>
        )
      ) : (
        <ul
          aria-label={titulo}
          className="m-0 flex list-none flex-col gap-1 p-0"
        >
          {cursos.map((curso) =>
            colapsado ? (
              <CursoContraido
                key={curso.id}
                curso={curso}
                actual={actual === curso.id}
                vista={vista}
                rol={user.rol}
                onNavigate={onNavigate}
              />
            ) : (
              <CursoDelMenu
                key={curso.id}
                curso={curso}
                actual={actual === curso.id}
                abierto={abierto === curso.id}
                onAlternar={() =>
                  setElegido(abierto === curso.id ? null : curso.id)
                }
                vista={vista}
                rol={user.rol}
                onNavigate={onNavigate}
              />
            ),
          )}
        </ul>
      )}
    </li>
  )
}

function VistasDelCurso({
  curso,
  actual,
  vista,
  rol,
  colapsado = false,
  onNavigate,
  id,
}: {
  curso: Curso
  actual: boolean
  vista: VistaId
  rol: string
  colapsado?: boolean
  onNavigate?: () => void
  id?: string
}) {
  return (
    <ul
      id={id}
      aria-label={`Vistas de ${curso.codigo}`}
      className={cn(
        'm-0 flex list-none flex-col gap-1 p-0',
        !colapsado && 'pl-3',
      )}
    >
      {VISTAS_CURSO.map(({ id: v, icono: Icono }) => (
        <li key={v}>
          <Link
            to={rutaVista(curso.id, v)}
            onClick={onNavigate}
            aria-current={actual && vista === v ? 'page' : undefined}
            className={claseItem(false)}
          >
            <Icono aria-hidden="true" className="size-4 shrink-0" />
            <span className="truncate">{etiquetaDeVista(v, rol)}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

function CursoDelMenu({
  curso,
  actual,
  abierto,
  onAlternar,
  vista,
  rol,
  onNavigate,
}: {
  curso: Curso
  actual: boolean
  abierto: boolean
  onAlternar: () => void
  vista: VistaId
  rol: string
  onNavigate?: () => void
}) {
  const idVistas = useId()
  return (
    <li className="grid gap-1">
      <div
        className={cn(
          'flex min-w-0 items-center rounded-md',
          actual && 'bg-accent/60',
        )}
      >
        <Link
          to={rutaSeccion(curso.id)}
          onClick={onNavigate}
          // El nombre se corta si no cabe: completo al pasar el mouse.
          title={`${curso.codigo} · ${curso.nombre}`}
          className="grid min-w-0 flex-1 gap-0.5 rounded-md px-3 py-2 no-underline hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:outline-none"
        >
          <span
            className={cn(
              'truncate text-sm',
              actual
                ? 'font-semibold text-foreground'
                : 'font-medium text-foreground/90',
            )}
          >
            {curso.codigo} · {curso.nombre}
          </span>
          <span className="text-xs text-muted-foreground">
            Sección {curso.numero}
          </span>
        </Link>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 shrink-0 text-muted-foreground"
          aria-expanded={abierto}
          aria-controls={idVistas}
          aria-label={`${abierto ? 'Ocultar' : 'Mostrar'} las vistas de ${curso.codigo}`}
          onClick={onAlternar}
        >
          <ChevronDown
            aria-hidden="true"
            className={cn(
              'transition-transform motion-reduce:transition-none',
              abierto && 'rotate-180',
            )}
          />
        </Button>
      </div>
      {abierto && (
        <VistasDelCurso
          id={idVistas}
          curso={curso}
          actual={actual}
          vista={vista}
          rol={rol}
          onNavigate={onNavigate}
        />
      )}
    </li>
  )
}

// Riel contraído: las iniciales del curso, con su nombre en un tooltip y sus
// vistas en un panel al hacer clic.
function CursoContraido({
  curso,
  actual,
  vista,
  rol,
  onNavigate,
}: {
  curso: Curso
  actual: boolean
  vista: VistaId
  rol: string
  onNavigate?: () => void
}) {
  const [abierto, setAbierto] = useState(false)
  const nombre = `${curso.codigo} · ${curso.nombre} (Sección ${curso.numero})`
  return (
    <li>
      <Popover open={abierto} onOpenChange={setAbierto}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={nombre}
                data-actual={actual || undefined}
                className={cn(
                  claseItem(true),
                  'w-full text-xs font-semibold data-[actual]:bg-accent data-[actual]:text-accent-foreground',
                )}
              >
                {iniciales(curso.nombre)}
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="right">{nombre}</TooltipContent>
        </Tooltip>
        <PopoverContent side="right" align="start" className="w-64 p-2">
          <p className="m-0 px-3 pt-1 pb-2 text-sm font-semibold text-foreground">
            {curso.codigo} · {curso.nombre}
          </p>
          <VistasDelCurso
            curso={curso}
            actual={actual}
            vista={vista}
            rol={rol}
            colapsado
            onNavigate={() => {
              setAbierto(false)
              onNavigate?.()
            }}
          />
        </PopoverContent>
      </Popover>
    </li>
  )
}
