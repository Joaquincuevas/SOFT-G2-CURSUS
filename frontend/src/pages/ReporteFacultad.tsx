import type {
  Periodo,
  ReporteCarrera,
  ReporteFacultad as DatosReporte,
} from '@cursus/shared'
import { CircleAlert } from 'lucide-react'
import { Fragment } from 'react'
import { useSearchParams } from 'react-router'
import {
  EmptyState,
  ErrorState,
  FormField,
  PageHeader,
} from '@/components/shared'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { NativeSelect } from '@/components/ui/native-select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { useDatos } from './useDatos'

const FORMATO_PERIODO = /^\d{4}-[12]$/
const SIN_DATOS = 'Sin datos suficientes'
const CONTENEDOR = 'grid min-w-0 gap-6'

// MET-08: reporte académico de la facultad del Administrativo, por carrera y
// curso, con aprobación, promedio y asistencia del período elegido.
export function ReporteFacultad() {
  const [params, fijarParams] = useSearchParams()
  const periodo = params.get('periodo')
  const valido = periodo === null || FORMATO_PERIODO.test(periodo)
  const consulta = periodo ? `?periodo=${encodeURIComponent(periodo)}` : ''
  const [datos, recargar, status] = useDatos<DatosReporte>(
    valido ? `/api/metricas/facultad${consulta}` : null,
  )
  const [periodos, recargarPeriodos] = useDatos<Periodo[]>('/api/periodos')
  const opciones = periodos ?? []

  if (!valido) {
    return (
      <section className={CONTENEDOR} aria-label="Reporte académico">
        <Alert variant="danger" className="max-w-xl">
          <CircleAlert aria-hidden="true" />
          <AlertDescription className="gap-3">
            <p className="m-0">
              El período «{periodo}» no es válido. Usa 2026-1 o 2026-2.
            </p>
            <Button type="button" onClick={() => fijarParams({})}>
              Ver el período activo
            </Button>
          </AlertDescription>
        </Alert>
      </section>
    )
  }

  return (
    <section
      className={CONTENEDOR}
      aria-label="Reporte académico de la facultad"
    >
      <PageHeader
        titulo="Reporte académico"
        descripcion={
          datos
            ? `${datos.facultad.nombre}: aprobación, promedio y asistencia por carrera y curso.`
            : 'Aprobación, promedio y asistencia por carrera y curso de tu facultad.'
        }
      />
      {periodos === null ? (
        <Alert variant="danger" className="max-w-md">
          <CircleAlert aria-hidden="true" />
          <AlertDescription className="gap-3">
            <span>No pudimos cargar los períodos.</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="bg-card text-foreground"
              onClick={recargarPeriodos}
            >
              Reintentar
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <FormField etiqueta="Período" className="max-w-sm">
          {(control) => (
            <NativeSelect
              {...control}
              className="h-10 text-base md:text-sm"
              value={periodo ?? periodoActivo(periodos)}
              disabled={periodos === undefined || opciones.length === 0}
              onChange={(evento) =>
                fijarParams({ periodo: evento.target.value })
              }
            >
              {periodos === undefined ? (
                <option value="">Cargando períodos…</option>
              ) : opciones.length === 0 ? (
                <option value="">No hay períodos disponibles</option>
              ) : (
                opciones.map((p) => (
                  <option key={p.id} value={valorDelPeriodo(p)}>
                    {valorDelPeriodo(p)}
                    {p.activo ? ' (activo)' : ''}
                  </option>
                ))
              )}
            </NativeSelect>
          )}
        </FormField>
      )}
      {datos === undefined ? (
        <div role="status" className="grid gap-3">
          <span className="sr-only">Cargando reporte académico…</span>
          <Skeleton className="h-12 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      ) : datos === null ? (
        <ErrorState
          mensaje={
            status === 400
              ? 'El período no es válido.'
              : 'No pudimos cargar el reporte académico.'
          }
          onReintentar={recargar}
        />
      ) : datos.carreras.length === 0 ? (
        <Card className="py-0">
          <EmptyState mensaje="Tu facultad no tiene carreras para este período." />
        </Card>
      ) : (
        <TablaReporte carreras={datos.carreras} />
      )}
    </section>
  )
}

// El año va con cuatro dígitos (Gestión admite del 1 al 9999): 999-1 se
// escribe 0999-1, que es lo que la API y esta pantalla aceptan en ?periodo=.
const valorDelPeriodo = ({
  anio,
  semestre,
}: Pick<Periodo, 'anio' | 'semestre'>) =>
  `${String(anio).padStart(4, '0')}-${semestre}`

function periodoActivo(periodos: Periodo[] | null | undefined) {
  const activo = periodos?.find((p) => p.activo)
  return activo ? valorDelPeriodo(activo) : ''
}

// Cada carrera abre su grupo de filas: la fila de la carrera y las de sus
// cursos. El grupo lleva la key (un Fragment sin key hacía que React avisara
// de una lista sin claves).
function TablaReporte({ carreras }: { carreras: ReporteCarrera[] }) {
  return (
    <Card className="min-w-0 gap-0 py-0">
      <Table>
        <caption className="sr-only">Carreras y cursos de la facultad</caption>
        <TableHeader className="bg-muted/60">
          <TableRow>
            <TableHead>Carrera / curso</TableHead>
            <TableHead>Aprobación</TableHead>
            <TableHead>Promedio</TableHead>
            <TableHead>Asistencia</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {carreras.map((carrera) => (
            <Fragment key={carrera.id}>
              <TableRow className="bg-muted/40 font-semibold hover:bg-muted/40">
                <TableHead
                  scope="row"
                  className="min-w-40 font-semibold whitespace-normal text-foreground"
                >
                  {carrera.nombre}
                </TableHead>
                <Celda
                  indicador={carrera.aprobacion}
                  decimales={1}
                  porcentaje
                />
                <Celda indicador={carrera.promedio} decimales={2} />
                <Celda
                  indicador={carrera.asistencia}
                  decimales={2}
                  porcentaje
                />
              </TableRow>
              {carrera.cursos.map((curso) => (
                <TableRow key={curso.id}>
                  <TableHead
                    scope="row"
                    className="min-w-40 pl-8 font-normal whitespace-normal text-foreground"
                  >
                    {curso.codigo} · {curso.nombre}
                  </TableHead>
                  <Celda
                    indicador={curso.aprobacion}
                    decimales={1}
                    porcentaje
                  />
                  <Celda indicador={curso.promedio} decimales={2} />
                  <Celda
                    indicador={curso.asistencia}
                    decimales={2}
                    porcentaje
                  />
                </TableRow>
              ))}
            </Fragment>
          ))}
        </TableBody>
      </Table>
    </Card>
  )
}

function Celda({
  indicador,
  decimales,
  porcentaje = false,
}: {
  indicador: { valor: number | null }
  decimales: number
  porcentaje?: boolean
}) {
  return (
    <TableCell
      className={cn(
        'tabular-nums',
        indicador.valor === null && 'text-muted-foreground',
      )}
    >
      {indicador.valor === null
        ? SIN_DATOS
        : `${indicador.valor.toLocaleString('es-CL', {
            minimumFractionDigits: decimales,
            maximumFractionDigits: decimales,
          })}${porcentaje ? ' %' : ''}`}
    </TableCell>
  )
}
