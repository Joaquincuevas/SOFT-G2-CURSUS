import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { EmptyState } from './EmptyState'

type Valor = string | number | Date | null | undefined

export interface Columna<T> {
  clave: string
  encabezado: string
  celda: (fila: T) => ReactNode
  // Con `valor` la columna se puede ordenar por ese valor (texto, número o
  // fecha). Sin él, el encabezado es solo un título.
  valor?: (fila: T) => Valor
  className?: string
}

export interface Orden {
  clave: string
  direccion: 'asc' | 'desc'
}

interface Props<T> {
  // Nombre de la tabla para los lectores de pantalla.
  etiqueta: string
  columnas: readonly Columna<T>[]
  filas: readonly T[]
  claveFila: (fila: T) => string
  cargando?: boolean
  // Filas de esqueleto mientras carga.
  filasDeCarga?: number
  // Lo que se muestra sin filas. Por defecto, un EmptyState genérico.
  vacio?: ReactNode
  ordenInicial?: Orden
  className?: string
}

const colador = new Intl.Collator('es', { numeric: true, sensitivity: 'base' })

function comoComparable(valor: Valor): string | number | null {
  if (valor === null || valor === undefined || valor === '') return null
  return valor instanceof Date ? valor.getTime() : valor
}

function comparar(a: string | number, b: string | number) {
  return typeof a === 'number' && typeof b === 'number'
    ? a - b
    : colador.compare(String(a), String(b))
}

// Tabla base sobre Table de shadcn: columnas tipadas, estado de carga con
// esqueletos, estado vacío y orden simple por columna (un clic ordena de menor
// a mayor, otro de mayor a menor y el tercero lo quita). Sin paginación: la
// página entrega las filas que quiere mostrar.
export function DataTable<T>({
  etiqueta,
  columnas,
  filas,
  claveFila,
  cargando = false,
  filasDeCarga = 5,
  vacio,
  ordenInicial,
  className,
}: Props<T>) {
  const [orden, setOrden] = useState<Orden | null>(ordenInicial ?? null)

  const ordenadas = useMemo(() => {
    const valor = columnas.find((c) => c.clave === orden?.clave)?.valor
    if (!orden || !valor) return filas
    const signo = orden.direccion === 'asc' ? 1 : -1
    // Las filas sin valor van siempre al final.
    return [...filas].sort((a, b) => {
      const x = comoComparable(valor(a))
      const y = comoComparable(valor(b))
      if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1
      return signo * comparar(x, y)
    })
  }, [columnas, filas, orden])

  const alternar = (clave: string) =>
    setOrden((actual) =>
      actual?.clave !== clave
        ? { clave, direccion: 'asc' }
        : actual.direccion === 'asc'
          ? { clave, direccion: 'desc' }
          : null,
    )

  return (
    <div
      data-slot="data-table"
      className={cn(
        'overflow-hidden rounded-lg border border-border bg-card',
        className,
      )}
    >
      {cargando && (
        <p role="status" className="sr-only">
          Cargando…
        </p>
      )}
      <Table aria-busy={cargando || undefined}>
        <TableCaption className="sr-only">{etiqueta}</TableCaption>
        <TableHeader>
          <TableRow>
            {columnas.map((columna) => {
              const activa = orden?.clave === columna.clave
              const Icono = !activa
                ? ArrowUpDown
                : orden.direccion === 'asc'
                  ? ArrowUp
                  : ArrowDown
              return (
                <TableHead
                  key={columna.clave}
                  className={columna.className}
                  aria-sort={
                    columna.valor
                      ? activa
                        ? orden.direccion === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                      : undefined
                  }
                >
                  {columna.valor ? (
                    <button
                      type="button"
                      data-slot="data-table-orden"
                      onClick={() => alternar(columna.clave)}
                      className="-mx-1 inline-flex items-center gap-1.5 rounded-sm px-1 font-medium hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      {columna.encabezado}
                      <Icono
                        aria-hidden="true"
                        className={cn(
                          'size-3.5',
                          !activa && 'text-muted-foreground',
                        )}
                      />
                    </button>
                  ) : (
                    columna.encabezado
                  )}
                </TableHead>
              )
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {cargando ? (
            Array.from({ length: filasDeCarga }, (_, i) => (
              <TableRow key={i} data-slot="data-table-carga">
                {columnas.map((columna) => (
                  <TableCell key={columna.clave} className={columna.className}>
                    <Skeleton className="h-4 w-full max-w-40" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : ordenadas.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={columnas.length}>
                {vacio ?? <EmptyState mensaje="No hay datos para mostrar." />}
              </TableCell>
            </TableRow>
          ) : (
            ordenadas.map((fila) => (
              <TableRow key={claveFila(fila)}>
                {columnas.map((columna) => (
                  <TableCell key={columna.clave} className={columna.className}>
                    {columna.celda(fila)}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
