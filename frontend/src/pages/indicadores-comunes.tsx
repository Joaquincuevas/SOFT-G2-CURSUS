import type { PeriodoDisponible } from '@cursus/shared'
import { Fragment, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { FormField } from '@/components/shared'
import { CircleAlert } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Card } from '@/components/ui/card'
import { NativeSelect } from '@/components/ui/native-select'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { SIN_DATOS, plural, valorIndicador } from './indicadores-formato'
import { useDatos } from './useDatos'

// Piezas que comparten el Dashboard del Director y las pantallas de
// Indicadores (MET-01 a MET-07).
// El año va con cuatro dígitos (Gestión admite del 1 al 9999), que es la forma
// que la API y estas pantallas aceptan en ?periodo=.
const valorDelPeriodo = ({ anio, semestre }: PeriodoDisponible) =>
  `${String(anio).padStart(4, '0')}-${semestre}`

// La vista por defecto ("") es el período activo de cada universidad, que
// puede ser distinto entre ellas; elegir un año y semestre filtra todas por
// ese período. Volver a la opción por defecto quita ?periodo= de la URL.
export function SelectorPeriodo({ periodo }: { periodo: string | null }) {
  const [periodosDisponibles, recargar] = useDatos<PeriodoDisponible[]>(
    '/api/metricas/periodos',
  )
  const [params, fijarParams] = useSearchParams()
  // Solo cambia el período: el resto de la URL (por ejemplo, el orden de la
  // tabla de cursos) se conserva para comparar semestres.
  const cambiar = (valorNuevo: string) => {
    const siguiente = new URLSearchParams(params)
    if (valorNuevo) siguiente.set('periodo', valorNuevo)
    else siguiente.delete('periodo')
    fijarParams(siguiente)
  }

  if (periodosDisponibles === null) {
    return (
      <AvisoError className="max-w-md">
        <span>No pudimos cargar los períodos.</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="bg-card text-foreground"
          onClick={recargar}
        >
          Reintentar
        </Button>
      </AvisoError>
    )
  }

  return (
    <FormField etiqueta="Período" className="max-w-sm">
      {(control) => (
        <NativeSelect
          {...control}
          className="h-10 text-base md:text-sm"
          value={periodo ?? ''}
          disabled={
            periodosDisponibles === undefined ||
            periodosDisponibles.length === 0
          }
          onChange={(e) => cambiar(e.target.value)}
        >
          {periodosDisponibles === undefined ? (
            <option value="">Cargando períodos…</option>
          ) : periodosDisponibles.length === 0 ? (
            <option value="">No hay períodos disponibles</option>
          ) : (
            <>
              <option value="">Período activo de cada universidad</option>
              {periodosDisponibles.map((p) => (
                <option key={valorDelPeriodo(p)} value={valorDelPeriodo(p)}>
                  {valorDelPeriodo(p)}
                </option>
              ))}
            </>
          )}
        </NativeSelect>
      )}
    </FormField>
  )
}

// Aviso de error con ícono (el color solo no basta) y, si hay, su acción.
function AvisoError({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  return (
    <Alert variant="danger" className={className}>
      <CircleAlert aria-hidden="true" />
      <AlertDescription className="gap-3">{children}</AlertDescription>
    </Alert>
  )
}

// El 400 del período no es "no existe": se dice qué falló y se ofrece volver
// al período activo.
export function PeriodoInvalido({ periodo }: { periodo: string | null }) {
  return (
    <section className="grid max-w-xl gap-4" aria-label="Período inválido">
      <AvisoError>
        <p className="m-0">
          El período «{periodo}» no es válido. Usa el formato año-semestre, por
          ejemplo 2026-1.
        </p>
        <Button asChild>
          <Link to="/indicadores">Ver el período activo</Link>
        </Button>
      </AvisoError>
    </section>
  )
}

// El recurso de la URL no existe: dice cuál y ofrece el camino de vuelta.
export function NoEncontrado({
  mensaje,
  volverA,
  textoVolver,
}: {
  mensaje: string
  volverA: string
  textoVolver: string
}) {
  return (
    <AvisoError className="max-w-xl">
      <p className="m-0">{mensaje}</p>
      <Button asChild>
        <Link to={volverA}>{textoVolver}</Link>
      </Button>
    </AvisoError>
  )
}

export interface Miga {
  texto: string
  // Sin `a` es la página actual.
  a?: string
}

// Ruta de navegación dentro de Indicadores: cada paso del drill-down vuelve a
// su nivel sin perder el período.
export function Migas({ pasos }: { pasos: Miga[] }) {
  return (
    <Breadcrumb aria-label="Ruta de navegación">
      <BreadcrumbList>
        {pasos.map((paso, i) => (
          <Fragment key={`${i}-${paso.texto}`}>
            {i > 0 && <BreadcrumbSeparator />}
            <BreadcrumbItem>
              {paso.a ? (
                <BreadcrumbLink asChild>
                  <Link to={paso.a}>{paso.texto}</Link>
                </BreadcrumbLink>
              ) : (
                <BreadcrumbPage>{paso.texto}</BreadcrumbPage>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  )
}

// Carga con esqueletos; el texto lo anuncian los lectores de pantalla.
export function CargandoEsqueleto({
  texto,
  tarjetas = 0,
  filas = 0,
}: {
  texto: string
  tarjetas?: number
  filas?: number
}) {
  return (
    <div role="status" className="grid gap-4">
      <span className="sr-only">{texto}</span>
      {tarjetas > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: tarjetas }, (_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      )}
      {filas > 0 &&
        Array.from({ length: filas }, (_, i) => (
          <Skeleton key={i} className="h-14 rounded-xl" />
        ))}
    </div>
  )
}

// Un indicador: título, valor grande y de dónde sale.
export function TarjetaIndicador({
  titulo,
  valor,
  unidad,
  decimales,
  detalle,
  className,
}: {
  titulo: string
  valor: number | null
  unidad: string
  decimales: number
  detalle: ReactNode
  className?: string
}) {
  return (
    <li className="min-w-0">
      <Card className={cn('h-full gap-3 py-5', className)}>
        <article aria-label={titulo} className="grid gap-2 px-5">
          <h3 className="m-0 text-sm font-medium text-muted-foreground">
            {titulo}
          </h3>
          {valor === null ? (
            <p className="m-0 text-lg font-medium text-muted-foreground">
              {SIN_DATOS}
            </p>
          ) : (
            <p className="m-0 flex items-baseline gap-1 text-4xl leading-none font-bold text-foreground tabular-nums">
              {valor.toLocaleString('es-CL', {
                minimumFractionDigits: decimales,
                maximumFractionDigits: decimales,
              })}
              {unidad && (
                <span className="text-xl font-medium text-muted-foreground">
                  {unidad}
                </span>
              )}
            </p>
          )}
          <p className="m-0 text-sm text-muted-foreground">{detalle}</p>
        </article>
      </Card>
    </li>
  )
}

interface ConIndicadores {
  aprobacion: { valor: number | null; aprobados: number; evaluados: number }
  promedio: { valor: number | null; alumnos: number }
  asistencia: { valor: number | null; presentes: number; registros: number }
}

// Los tres indicadores de siempre: aprobación, promedio y asistencia.
export function TresIndicadores({
  datos,
  aprobadosEnPlural = false,
  extra,
  className,
}: {
  datos: ConIndicadores
  aprobadosEnPlural?: boolean
  // Más tarjetas a continuación de las tres (el Dashboard suma los conteos).
  extra?: ReactNode
  className?: string
}) {
  const { aprobacion, promedio, asistencia } = datos
  return (
    <ul
      className={cn(
        'm-0 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3',
        className,
      )}
      aria-label="Indicadores"
    >
      <TarjetaIndicador
        titulo="Tasa de aprobación"
        valor={aprobacion.valor}
        unidad="%"
        decimales={1}
        detalle={`${aprobadosEnPlural ? plural(aprobacion.aprobados, 'aprobado') : aprobacion.aprobados} de ${plural(aprobacion.evaluados, 'alumno')} con nota final`}
      />
      <TarjetaIndicador
        titulo="Promedio"
        valor={promedio.valor}
        unidad=""
        decimales={2}
        detalle={`${plural(promedio.alumnos, 'alumno')} con nota final`}
      />
      <TarjetaIndicador
        titulo="Asistencia"
        valor={asistencia.valor}
        unidad="%"
        decimales={2}
        detalle={`${asistencia.presentes} presentes de ${plural(asistencia.registros, 'registro')}`}
      />
      {extra}
    </ul>
  )
}

// Aprobación, promedio y asistencia en una línea (listas de universidades).
export function ResumenEnLinea({
  indicadores: i,
}: {
  indicadores: Pick<ConIndicadores, 'aprobacion' | 'promedio' | 'asistencia'>
}) {
  return (
    <p className="m-0 text-sm text-muted-foreground">
      Aprobación: {valorIndicador(i.aprobacion.valor, 1, ' %')} · Promedio:{' '}
      {valorIndicador(i.promedio.valor, 2)} · Asistencia:{' '}
      {valorIndicador(i.asistencia.valor, 2, ' %')}
    </p>
  )
}
