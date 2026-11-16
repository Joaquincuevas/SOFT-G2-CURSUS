import type { ResumenUniversidad } from '@cursus/shared'
import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router'
import { DataTable, type Columna } from '@/components/shared'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ENLACE, SIN_DATOS, valorIndicador } from './indicadores-formato'

const NUMERO = 'text-right tabular-nums'

// Un indicador sin denominador: un guion con el motivo en un tooltip (y en
// texto para los lectores de pantalla), en vez de la frase en cada celda.
export function ValorIndicador({
  valor,
  decimales,
  unidad = '',
}: {
  valor: number | null
  decimales: number
  unidad?: string
}) {
  if (valor !== null) return <>{valorIndicador(valor, decimales, unidad)}</>
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className="rounded-sm text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <span aria-hidden="true">—</span>
          <span className="sr-only">{SIN_DATOS}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>{SIN_DATOS}</TooltipContent>
    </Tooltip>
  )
}

function columnas(
  sufijo: string,
  conAlumnos: boolean,
): Columna<ResumenUniversidad>[] {
  return [
    {
      clave: 'universidad',
      encabezado: 'Universidad',
      valor: (u) => u.nombre,
      className: 'whitespace-normal min-w-44',
      celda: (u) => (
        <Link
          className={ENLACE}
          to={`/indicadores/universidades/${u.id}${sufijo}`}
        >
          {u.nombre}
        </Link>
      ),
    },
    {
      clave: 'aprobacion',
      encabezado: 'Aprobación',
      valor: (u) => u.aprobacion.valor,
      className: NUMERO,
      celda: (u) => (
        <ValorIndicador valor={u.aprobacion.valor} decimales={1} unidad=" %" />
      ),
    },
    {
      clave: 'promedio',
      encabezado: 'Promedio',
      valor: (u) => u.promedio.valor,
      className: NUMERO,
      celda: (u) => <ValorIndicador valor={u.promedio.valor} decimales={2} />,
    },
    {
      clave: 'asistencia',
      encabezado: 'Asistencia',
      valor: (u) => u.asistencia.valor,
      className: NUMERO,
      celda: (u) => (
        <ValorIndicador valor={u.asistencia.valor} decimales={2} unidad=" %" />
      ),
    },
    ...(conAlumnos
      ? [
          {
            clave: 'alumnos',
            encabezado: 'Alumnos',
            valor: (u: ResumenUniversidad) => u.alumnos,
            className: NUMERO,
            celda: (u: ResumenUniversidad) => u.alumnos.toLocaleString('es-CL'),
          },
        ]
      : []),
    {
      clave: 'ir',
      encabezado: <span className="sr-only">Detalle</span>,
      className: 'w-10 text-right',
      celda: () => (
        <ChevronRight
          aria-hidden="true"
          className="ml-auto size-4 text-muted-foreground"
        />
      ),
    },
  ]
}

// Universidades del Directorio con sus indicadores: la misma tabla en el
// Dashboard, Indicadores y Universidades. El nombre lleva al detalle de la
// universidad en Indicadores (MET-04), conservando el período.
export function TablaUniversidades({
  universidades,
  sufijo = '',
  conAlumnos = false,
  cargando = false,
}: {
  universidades: readonly ResumenUniversidad[]
  sufijo?: string
  conAlumnos?: boolean
  cargando?: boolean
}) {
  return (
    <DataTable
      etiqueta="Universidades"
      columnas={columnas(sufijo, conAlumnos)}
      filas={universidades}
      claveFila={(u) => u.id}
      cargando={cargando}
      filasDeCarga={2}
      textoDeCarga="Cargando universidades…"
    />
  )
}
