import {
  DIAS_SEMANA,
  ZONA_HORARIA_UNIVERSIDAD,
  type Actividad,
  type Anuncio,
  type BloqueHorario,
  type SeccionAyudante,
  type SeccionDashboard,
  type SeccionResumen,
} from '@cursus/shared'
import {
  CalendarCheck,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  FolderOpen,
  Inbox,
  Megaphone,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { EmptyState, ErrorState } from '@/components/shared'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { fechaAnuncio } from './anuncios'
import { ENLACE } from './indicadores-formato'
import {
  nombresProfesores,
  RUTA_MIS_SECCIONES,
  RUTA_PAGINA_PENDIENTES,
  rutaSeccion,
  textoAlumnos,
  textoBloque,
  textoPendientes,
  textoProfesores,
} from './misSecciones'
import { RUTA_SECCIONES_AYUDANTE } from './SeccionesAyudante'
import { useDatos } from './useDatos'
import { useDeSecciones } from './useDeSecciones'

// Sección normalizada: el profesor trae horario y alumnos; el ayudante, solo
// el curso (su horario sale del resumen de cada sección).
interface Seccion {
  id: string
  numero: number
  curso: { codigo: string; nombre: string }
  horario?: BloqueHorario[]
  alumnos?: number
  // Solo el ayudante: sus profesores a cargo.
  profesores?: string[]
  pendientesRevision: number
}

const DIAS_PROXIMOS = 14
const DIA_MS = 86_400_000

const fechaCorta = (iso: string) =>
  new Date(iso).toLocaleDateString('es-CL', {
    timeZone: ZONA_HORARIA_UNIVERSIDAD,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })

const ACCESOS: { vista: string; etiqueta: string; icono: LucideIcon }[] = [
  { vista: 'anuncios', etiqueta: 'Anuncios', icono: Megaphone },
  { vista: 'material', etiqueta: 'Material', icono: FolderOpen },
  { vista: 'entregas', etiqueta: 'Entregas', icono: Inbox },
  { vista: 'notas', etiqueta: 'Notas', icono: ClipboardList },
  { vista: 'asistencia', etiqueta: 'Asistencia', icono: CalendarCheck },
  { vista: 'integrantes', etiqueta: 'Integrantes', icono: Users },
]

// Dashboard del Profesor (ESP-01) y del Ayudante (ESP-02): un panel de
// trabajo con lo que sigue (por revisar, próximas fechas, horario de la
// semana, actividad reciente) y las tarjetas de sus cursos con accesos a sus
// pestañas. Cada bloque carga y falla por separado.
export function DashboardDocente({ rol }: { rol: 'PROFESOR' | 'AYUDANTE' }) {
  const esProfesor = rol === 'PROFESOR'
  const [datos, recargar] = useDatos<(SeccionDashboard | SeccionAyudante)[]>(
    esProfesor ? RUTA_MIS_SECCIONES : RUTA_SECCIONES_AYUDANTE,
  )
  const secciones = useMemo<Seccion[] | null | undefined>(
    () =>
      datos &&
      datos.map((s) => ({
        id: s.id,
        numero: s.numero,
        curso: s.curso,
        horario: 'horario' in s ? s.horario : undefined,
        alumnos: 'alumnos' in s ? s.alumnos : undefined,
        profesores: 'profesores' in s ? nombresProfesores(s) : undefined,
        pendientesRevision:
          'pendientesRevision' in s ? s.pendientesRevision : 0,
      })),
    [datos],
  )
  const ids = secciones ? secciones.map((s) => s.id) : undefined
  const [actividades, recargarActividades] = useDeSecciones<Actividad[]>(
    ids,
    'actividades',
  )
  const [anuncios, recargarAnuncios] = useDeSecciones<Anuncio[]>(
    ids,
    'anuncios',
  )
  // El ayudante no trae el horario en su lista: sale del resumen de cada
  // sección.
  const [resumenes, recargarResumenes] = useDeSecciones<SeccionResumen>(
    esProfesor ? null : ids,
    'resumen',
  )
  const horarios = useMemo(() => {
    if (!secciones) return undefined
    if (esProfesor)
      return secciones.map((s) => ({ ...s, horario: s.horario ?? [] }))
    if (!resumenes) return resumenes
    return secciones.map((s) => ({
      ...s,
      horario: resumenes.find(([id]) => id === s.id)?.[1].horario ?? [],
    }))
  }, [secciones, esProfesor, resumenes])

  const pendientes =
    secciones?.reduce((n, s) => n + s.pendientesRevision, 0) ?? 0
  const porSeccion = (id: string) => secciones?.find((s) => s.id === id)

  return (
    <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="grid min-w-0 gap-6">
        {esProfesor && secciones?.length ? (
          <PorRevisar pendientes={pendientes} />
        ) : null}
        <Bloque titulo="Mis secciones del período">
          <TarjetasCurso
            secciones={secciones}
            recargar={recargar}
            vacio={
              esProfesor
                ? 'No tienes secciones a tu cargo en el período activo.'
                : 'No eres ayudante de ninguna sección en el período activo.'
            }
          />
        </Bloque>
        <Bloque titulo="Actividad reciente">
          <ActividadReciente
            anuncios={anuncios}
            recargar={recargarAnuncios}
            seccion={porSeccion}
            cargandoSecciones={secciones === undefined}
            errorSecciones={secciones === null}
          />
        </Bloque>
      </div>
      <div className="grid min-w-0 gap-6">
        <Bloque titulo="Próximas fechas">
          <ProximasFechas
            actividades={actividades}
            recargar={recargarActividades}
            seccion={porSeccion}
            cargandoSecciones={secciones === undefined}
            errorSecciones={secciones === null}
          />
        </Bloque>
        <Bloque titulo="Horario de la semana">
          <HorarioSemana
            secciones={horarios}
            error={secciones === null}
            recargar={esProfesor ? recargar : recargarResumenes}
          />
        </Bloque>
      </div>
    </div>
  )
}

function Bloque({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section aria-label={titulo} className="grid min-w-0 gap-3">
      <h2 className="m-0 text-lg font-semibold text-foreground">{titulo}</h2>
      {children}
    </section>
  )
}

function Esqueleto({ texto, filas = 3 }: { texto: string; filas?: number }) {
  return (
    <div role="status" className="grid gap-2">
      <span className="sr-only">{texto}</span>
      {Array.from({ length: filas }, (_, i) => (
        <Skeleton key={i} className="h-14 rounded-lg" />
      ))}
    </div>
  )
}

function SinSecciones() {
  return (
    <p className="m-0 text-sm text-muted-foreground">
      Se mostrará cuando carguen tus secciones.
    </p>
  )
}

function PorRevisar({ pendientes }: { pendientes: number }) {
  return (
    <Alert role="region" aria-label="Por revisar" className="min-w-0 bg-card">
      <ClipboardCheck aria-hidden="true" />
      <AlertTitle>Por revisar</AlertTitle>
      <AlertDescription>
        {pendientes === 0 ? (
          <p className="m-0">No tienes evaluaciones pendientes de revisión.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <p className="m-0">{textoPendientes(pendientes)}.</p>
            <Button asChild variant="outline" size="sm">
              <Link to={RUTA_PAGINA_PENDIENTES}>Ver pendientes</Link>
            </Button>
          </div>
        )}
      </AlertDescription>
    </Alert>
  )
}

function TarjetasCurso({
  secciones,
  recargar,
  vacio,
}: {
  secciones: Seccion[] | null | undefined
  recargar: () => void
  vacio: string
}) {
  if (secciones === undefined)
    return <Esqueleto texto="Cargando tus secciones…" />
  if (secciones === null)
    return (
      <ErrorState
        mensaje="No pudimos cargar tus secciones."
        onReintentar={recargar}
      />
    )
  if (secciones.length === 0)
    return (
      <Card className="py-0">
        <EmptyState
          icono={CalendarDays}
          titulo={vacio}
          mensaje="Las secciones aparecerán aquí cuando estén asignadas en el período activo."
        />
      </Card>
    )
  return (
    <ul
      aria-label="Secciones del período activo"
      className="m-0 grid list-none gap-4 p-0 md:grid-cols-2"
    >
      {secciones.map((s) => (
        <li key={s.id} className="min-w-0">
          <Card className="h-full gap-0 overflow-hidden py-0">
            <CardHeader className="gap-1 border-b bg-primary/10 px-5 py-4">
              <span className="text-xs font-semibold text-primary tabular-nums">
                {s.curso.codigo} · Sección {s.numero}
              </span>
              <h3 className="m-0 text-base font-semibold break-words">
                <Link to={rutaSeccion(s.id)} className={ENLACE}>
                  <span className="text-foreground">{s.curso.nombre}</span>
                </Link>
              </h3>
            </CardHeader>
            <CardContent className="grid gap-3 px-5 py-4 text-sm text-muted-foreground">
              {s.alumnos !== undefined && (
                <p className="m-0 font-medium text-foreground">
                  {textoAlumnos(s.alumnos)}
                </p>
              )}
              {s.profesores && (
                <p className="m-0 break-words">
                  {textoProfesores(s.profesores)}
                </p>
              )}
              {s.horario &&
                (s.horario.length === 0 ? (
                  <p className="m-0">Sin horario asignado</p>
                ) : (
                  <ul
                    className="m-0 grid list-none gap-1 p-0"
                    aria-label={`Horario de ${s.curso.codigo}`}
                  >
                    {s.horario.map((b) => (
                      <li key={`${b.dia}-${b.inicio}`}>{textoBloque(b)}</li>
                    ))}
                  </ul>
                ))}
              {s.pendientesRevision > 0 && (
                <Badge
                  variant="secondary"
                  className="max-w-full whitespace-normal"
                >
                  {textoPendientes(s.pendientesRevision)}
                </Badge>
              )}
              <div
                role="group"
                aria-label={`Accesos de ${s.curso.codigo}`}
                className="flex flex-wrap gap-1.5 border-t border-border pt-3"
              >
                {ACCESOS.map(({ vista, etiqueta, icono: Icono }) => (
                  <Tooltip key={vista}>
                    <TooltipTrigger asChild>
                      <Button
                        asChild
                        variant="outline"
                        size="icon"
                        className="size-9"
                      >
                        <Link
                          to={rutaSeccion(s.id, vista)}
                          aria-label={`${etiqueta} de ${s.curso.codigo}`}
                        >
                          <Icono aria-hidden="true" />
                        </Link>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{etiqueta}</TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  )
}

interface PropsDependiente<T> {
  recargar: () => void
  seccion: (id: string) => Seccion | undefined
  cargandoSecciones: boolean
  errorSecciones: boolean
  datos?: T
}

// Estados comunes de los bloques que piden datos por sección. Devuelve el
// elemento a mostrar, o null si ya hay datos.
function estadoDeBloque(
  datos: unknown,
  p: Pick<
    PropsDependiente<unknown>,
    'recargar' | 'cargandoSecciones' | 'errorSecciones'
  >,
  texto: string,
  mensajeError: string,
) {
  // El error ya se muestra, con su reintento, en las tarjetas.
  if (p.errorSecciones) return <SinSecciones />
  if (p.cargandoSecciones || datos === undefined)
    return <Esqueleto texto={texto} filas={2} />
  if (datos === null)
    return <ErrorState mensaje={mensajeError} onReintentar={p.recargar} />
  return null
}

function ProximasFechas({
  actividades,
  ...p
}: Omit<PropsDependiente<never>, 'datos'> & {
  actividades: [string, Actividad[]][] | null | undefined
}) {
  const [ahora] = useState(() => Date.now())
  const estado = estadoDeBloque(
    actividades,
    p,
    'Cargando próximas fechas…',
    'No pudimos cargar las próximas fechas.',
  )
  if (estado) return estado
  const limite = ahora + DIAS_PROXIMOS * DIA_MS
  const proximas = (actividades ?? [])
    .flatMap(([id, lista]) => lista.map((a) => ({ ...a, seccionId: id })))
    .filter((a) => {
      const plazo = new Date(a.plazo).getTime()
      return !a.cerrada && plazo >= ahora && plazo <= limite
    })
    .sort((a, b) => a.plazo.localeCompare(b.plazo))
  if (proximas.length === 0)
    return (
      <Card className="py-0">
        <EmptyState
          icono={Inbox}
          mensaje="No hay entregas por vencer en los próximos 14 días."
        />
      </Card>
    )
  return (
    <Card className="py-0">
      <ul className="m-0 grid list-none divide-y divide-border p-0">
        {proximas.map((a) => {
          const s = p.seccion(a.seccionId)
          return (
            <li
              key={`${a.seccionId}-${a.id}`}
              className="grid gap-0.5 px-4 py-3"
            >
              <Link
                to={rutaSeccion(a.seccionId, 'entregas')}
                className={cn(ENLACE, 'break-words')}
              >
                {a.titulo}
              </Link>
              <span className="text-xs text-muted-foreground">
                {s ? `${s.curso.codigo} · ` : ''}
                <time dateTime={a.plazo} className="tabular-nums">
                  {fechaCorta(a.plazo)}
                </time>
              </span>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

function ActividadReciente({
  anuncios,
  ...p
}: Omit<PropsDependiente<never>, 'datos'> & {
  anuncios: [string, Anuncio[]][] | null | undefined
}) {
  const estado = estadoDeBloque(
    anuncios,
    p,
    'Cargando actividad reciente…',
    'No pudimos cargar la actividad reciente.',
  )
  if (estado) return estado
  // Un anuncio de curso llega por cada sección del curso: se cuenta una vez.
  const vistos = new Set<string>()
  const recientes = (anuncios ?? [])
    .flatMap(([id, lista]) => lista.map((a) => ({ ...a, seccionId: id })))
    .filter((a) => !vistos.has(a.id) && vistos.add(a.id))
    .sort((a, b) => b.publicadoEn.localeCompare(a.publicadoEn))
    .slice(0, 3)
  if (recientes.length === 0)
    return (
      <Card className="py-0">
        <EmptyState
          icono={Megaphone}
          mensaje="Aún no hay anuncios en tus cursos."
        />
      </Card>
    )
  return (
    <Card className="py-0">
      <ul
        aria-label="Últimos anuncios"
        className="m-0 grid list-none divide-y divide-border p-0"
      >
        {recientes.map((a) => {
          const s = p.seccion(a.seccionId)
          return (
            <li key={a.id} className="grid gap-0.5 px-4 py-3">
              <Link
                to={rutaSeccion(a.seccionId, 'anuncios')}
                className={cn(ENLACE, 'break-words')}
              >
                {a.titulo}
              </Link>
              <span className="text-xs text-muted-foreground">
                {s ? `${s.curso.codigo} · ` : ''}
                {a.autor.nombre} · {fechaAnuncio(a.publicadoEn)}
              </span>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

function HorarioSemana({
  secciones,
  error,
  recargar,
}: {
  secciones: (Seccion & { horario: BloqueHorario[] })[] | null | undefined
  error: boolean
  recargar: () => void
}) {
  // 1 = lunes … 7 = domingo, como `dia` de los bloques.
  const [hoy] = useState(() => ((new Date().getDay() + 6) % 7) + 1)
  if (error) return <SinSecciones />
  if (secciones === null)
    return (
      <ErrorState
        mensaje="No pudimos cargar el horario."
        onReintentar={recargar}
      />
    )
  if (secciones === undefined)
    return <Esqueleto texto="Cargando horario…" filas={2} />
  const bloques = secciones.flatMap((s) =>
    s.horario.map((b) => ({ ...b, curso: s.curso.codigo })),
  )
  return (
    <Card className="py-0">
      <ol className="m-0 grid list-none divide-y divide-border p-0">
        {DIAS_SEMANA.slice(0, 6).map((nombre, i) => {
          const dia = i + 1
          const delDia = bloques
            .filter((b) => b.dia === dia)
            .sort((a, b) => a.inicio.localeCompare(b.inicio))
          return (
            <li
              key={nombre}
              aria-current={dia === hoy ? 'date' : undefined}
              className={cn(
                'grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2 px-4 py-2.5 text-sm',
                dia === hoy && 'bg-primary/10',
              )}
            >
              <span
                className={cn(
                  'font-medium',
                  dia === hoy ? 'text-primary' : 'text-foreground',
                )}
              >
                {nombre}
                {dia === hoy && <span className="sr-only"> (hoy)</span>}
              </span>
              {delDia.length === 0 ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                <ul className="m-0 grid list-none gap-1 p-0">
                  {delDia.map((b) => (
                    <li key={`${b.curso}-${b.inicio}`}>
                      <span className="tabular-nums">
                        {b.inicio}–{b.termino}
                      </span>{' '}
                      · {b.sala} ·{' '}
                      <span className="font-medium">{b.curso}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ol>
    </Card>
  )
}
