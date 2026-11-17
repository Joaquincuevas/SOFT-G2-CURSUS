import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
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
  encabezado: ReactNode
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
  // Filas de esqueleto mientras carga, y lo que se anuncia.
  filasDeCarga?: number
  textoDeCarga?: string
  // Lo que se muestra sin filas. Por defecto, un EmptyState genérico.
  vacio?: ReactNode
  ordenInicial?: Orden
  // Filas por página. Sin esto se muestran todas. Las páginas se calculan
  // después de ordenar, en el cliente.
  porPagina?: number
  // La cabecera queda fija al desplazar la tabla (con alto máximo propio).
  cabeceraFija?: boolean
  // Hace clicable la fila entera (por ejemplo, para abrir su detalle). Un clic
  // en un enlace o botón de la fila no lo dispara; el teclado usa esos
  // controles, y la fila se resalta cuando uno tiene el foco.
  alHacerClic?: (fila: T) => void
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
// a mayor, otro de mayor a menor y el tercero lo quita). Con `porPagina`,
// pagina en el cliente con «Anterior» y «Siguiente».
export function DataTable<T>({
  etiqueta,
  columnas,
  filas,
  claveFila,
  cargando = false,
  filasDeCarga = 5,
  textoDeCarga = 'Cargando…',
  vacio,
  ordenInicial,
  porPagina,
  cabeceraFija = false,
  alHacerClic,
  className,
}: Props<T>) {
  const [orden, setOrden] = useState<Orden | null>(ordenInicial ?? null)
  const [pagina, setPagina] = useState(1)
  // Otras filas (por ejemplo, otro filtro) vuelven a la primera página.
  const [filasPrevias, setFilasPrevias] = useState(filas)
  if (filas !== filasPrevias) {
    setFilasPrevias(filas)
    setPagina(1)
  }

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

  const paginas = porPagina
    ? Math.max(1, Math.ceil(ordenadas.length / porPagina))
    : 1
  const actual = Math.min(pagina, paginas)
  const visibles = porPagina
    ? ordenadas.slice((actual - 1) * porPagina, actual * porPagina)
    : ordenadas

  const alternar = (clave: string) => {
    setPagina(1)
    setOrden((actual) =>
      actual?.clave !== clave
        ? { clave, direccion: 'asc' }
        : actual.direccion === 'asc'
          ? { clave, direccion: 'desc' }
          : null,
    )
  }

  return (
    <div
      data-slot="data-table"
      className={cn(
        'overflow-hidden rounded-lg border border-border bg-card',
        cabeceraFija &&
          'md:[&_[data-slot=table-container]]:max-h-[70vh] md:[&_[data-slot=table-container]]:overflow-y-auto md:[&_thead_th]:sticky md:[&_thead_th]:top-0 md:[&_thead_th]:z-10 md:[&_thead_th]:bg-muted',
        className,
      )}
    >
      {cargando && (
        <p role="status" className="sr-only">
          {textoDeCarga}
        </p>
      )}
      <Table aria-busy={cargando || undefined}>
        <TableCaption className="sr-only">{etiqueta}</TableCaption>
        <TableHeader className="bg-muted/60">
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
            visibles.map((fila) => (
              <TableRow
                key={claveFila(fila)}
                onClick={
                  alHacerClic
                    ? (evento) => {
                        if (!(evento.target as HTMLElement).closest('a,button'))
                          alHacerClic(fila)
                      }
                    : undefined
                }
                className={
                  alHacerClic
                    ? 'cursor-pointer focus-within:bg-muted/50'
                    : undefined
                }
              >
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
      {porPagina && !cargando && paginas > 1 && (
        <nav
          aria-label="Paginación"
          className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2 text-sm text-muted-foreground"
        >
          <span>
            Página {actual} de {paginas}
          </span>
          <span className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={actual <= 1}
              onClick={() => setPagina(actual - 1)}
            >
              Anterior
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={actual >= paginas}
              onClick={() => setPagina(actual + 1)}
            >
              Siguiente
            </Button>
          </span>
        </nav>
      )}
    </div>
  )
}
